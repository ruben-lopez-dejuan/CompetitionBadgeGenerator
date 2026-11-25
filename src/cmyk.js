// Turns a finished PDF (from pdfExport.js) into CMYK with the printer's ICC
// profile. It works on the PDF itself, so everything drawn on it is covered.

import { PDFDocument, PDFName, PDFArray, PDFDict, PDFRawStream, PDFString, PDFHexString, decodePDFRawStream } from "pdf-lib";
import { instantiate, TYPE_RGB_8, TYPE_CMYK_8, INTENT_RELATIVE_COLORIMETRIC, cmsFLAGS_BLACKPOINTCOMPENSATION, cmsInfoDescription } from "./vendor/lcms/lcms.min.js";
import wasmUrl from "./vendor/lcms/lcms.wasm?url";

let lcmsPromise = null;
const loadLcms = () => {
  lcmsPromise ||= instantiate({ locateFile: () => wasmUrl }).catch((err) => {
    lcmsPromise = null;
    throw err;
  });
  return lcmsPromise;
};

// The profile's description and a function from RGB pixels (3 bytes each) to
// CMYK ones (4 bytes each); dispose() frees the memory.
async function openProfile(bytes) {
  const lcms = await loadLcms();
  // Not lcms.cmsOpenProfileFromMem, which copies the profile to the small
  // WASM stack. LittleCMS keeps its own copy of the memory.
  const ptr = lcms._malloc(bytes.length);
  lcms.HEAPU8.set(bytes, ptr);
  const profile = lcms.ccall("cmsOpenProfileFromMem", "number", ["number", "number"], [ptr, bytes.length]);
  lcms._free(ptr);
  if (!profile) throw new Error("This file isn't an ICC color profile.");
  if (lcms.cmsGetColorSpaceASCII(profile) !== "CMYK") {
    lcms.cmsCloseProfile(profile);
    throw new Error("This color profile isn't a CMYK one.");
  }
  const srgb = lcms.cmsCreate_sRGBProfile();
  const transform = lcms.cmsCreateTransform(srgb, TYPE_RGB_8, profile, TYPE_CMYK_8, INTENT_RELATIVE_COLORIMETRIC, cmsFLAGS_BLACKPOINTCOMPENSATION);
  const description = lcms.cmsGetProfileInfoASCII(profile, cmsInfoDescription, "en", "US").split("\u0000")[0];
  lcms.cmsCloseProfile(srgb);
  lcms.cmsCloseProfile(profile);
  if (!transform) throw new Error("This color profile can't be used to print.");

  const CHUNK = 1 << 20; // pixels at a time, to keep the WASM memory small
  const toCmyk = (rgb) => {
    const pixels = rgb.length / 3;
    const out = new Uint8Array(pixels * 4);
    for (let i = 0; i < pixels; i += CHUNK) {
      const n = Math.min(CHUNK, pixels - i);
      out.set(lcms.cmsDoTransform(transform, rgb.subarray(i * 3, (i + n) * 3), n), i * 4);
    }
    return out;
  };
  return { description, toCmyk, dispose: () => lcms.cmsDeleteTransform(transform) };
}

/** Checks a profile and returns its description; throws if it can't be used. */
export async function cmykProfileDescription(bytes) {
  const profile = await openProfile(bytes);
  profile.dispose();
  return profile.description;
}

const pipe = async (bytes, transform) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(transform)).arrayBuffer());
const deflate = (bytes) => pipe(bytes, new CompressionStream("deflate"));
const inflate = (bytes) => pipe(bytes, new DecompressionStream("deflate"));

async function jpegPixels(bytes) {
  const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/jpeg" }), { colorSpaceConversion: "none", imageOrientation: "none" });
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const rgb = new Uint8Array((rgba.length / 4) * 3);
  for (let i = 0, j = 0; i < rgba.length; i += 4) {
    rgb[j++] = rgba[i];
    rgb[j++] = rgba[i + 1];
    rgb[j++] = rgba[i + 2];
  }
  return rgb;
}

// One channel of an image that's only pure black and white (a QR code), to
// print it with black ink alone; null for any other image.
function blackAndWhite(rgb) {
  const gray = new Uint8Array(rgb.length / 3);
  for (let i = 0, j = 0; i < rgb.length; i += 3) {
    const v = rgb[i];
    if ((v !== 0 && v !== 255) || rgb[i + 1] !== v || rgb[i + 2] !== v) return null;
    gray[j++] = v;
  }
  return gray;
}

/** Converts a PDF's bytes to CMYK and embeds the profile as its output intent. */
export async function convertPdfToCmyk(bytes, profileBytes) {
  const profile = await openProfile(profileBytes);
  try {
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    const { context } = doc;
    const name = (n) => PDFName.of(n);

    // Text and shapes. Black and grays use black ink only, so text is sharp.
    const colors = new Map();
    const inks = (values) => {
      const rgb = values.map((v) => Math.round(Math.min(1, Math.max(0, Number(v))) * 255));
      const key = rgb.join();
      if (!colors.has(key)) {
        const [r, g, b] = rgb;
        const cmyk = r === g && g === b ? [0, 0, 0, 1 - r / 255] : [...profile.toCmyk(Uint8Array.from(rgb))].map((v) => v / 255);
        colors.set(key, cmyk.map((v) => Number(v.toFixed(4))).join(" "));
      }
      return colors.get(key);
    };
    const convertOperators = (stream) => {
      const source = decodePDFRawStream(stream).decode();
      let text = "";
      for (let i = 0; i < source.length; i += 8192) text += String.fromCharCode(...source.subarray(i, i + 8192));
      // pdf-lib writes one operator per line, and text as hex strings.
      const converted = text.replace(/^([-\d.]+) ([-\d.]+) ([-\d.]+) (rg|RG)$/gm, (_, r, g, b, op) => `${inks([r, g, b])} ${op === "rg" ? "k" : "K"}`);
      return deflate(Uint8Array.from(converted, (c) => c.charCodeAt(0)));
    };

    const convertImage = async (dict, contents) => {
      const isJpeg = dict.lookup(name("Filter")) === name("DCTDecode");
      const rgb = isJpeg ? await jpegPixels(contents) : await inflate(contents);
      const gray = blackAndWhite(rgb);
      dict.set(name("ColorSpace"), name(gray ? "DeviceGray" : "DeviceCMYK"));
      return deflate(gray || profile.toCmyk(rgb));
    };

    const contentRefs = new Set();
    for (const page of doc.getPages()) {
      const raw = page.node.get(name("Contents"));
      const contents = context.lookup(raw);
      if (contents instanceof PDFArray) contents.asArray().forEach((ref) => contentRefs.add(ref));
      else if (raw) contentRefs.add(raw);
      // Blend transparencies in CMYK too.
      page.node.set(name("Group"), context.obj({ Type: "Group", S: "Transparency", CS: "DeviceCMYK" }));
    }

    for (const [ref, object] of context.enumerateIndirectObjects()) {
      if (!(object instanceof PDFRawStream)) continue;
      const { dict } = object;
      const subtype = dict.lookup(name("Subtype"));
      let converted = null;
      if (contentRefs.has(ref) || subtype === name("Form")) converted = await convertOperators(object);
      else if (subtype === name("Image") && dict.lookup(name("ColorSpace")) === name("DeviceRGB")) converted = await convertImage(dict, object.contents);
      if (!converted) continue;
      dict.set(name("Filter"), name("FlateDecode"));
      context.assign(ref, PDFRawStream.of(dict, converted));
    }

    const profileRef = context.register(context.stream(await deflate(profileBytes), { N: 4, Filter: "FlateDecode" }));
    const intent = PDFDict.withContext(context);
    intent.set(name("Type"), name("OutputIntent"));
    intent.set(name("S"), name("GTS_PDFX"));
    intent.set(name("OutputConditionIdentifier"), PDFString.of("Custom"));
    intent.set(name("Info"), PDFHexString.fromText(profile.description));
    intent.set(name("DestOutputProfile"), profileRef);
    doc.catalog.set(name("OutputIntents"), context.obj([context.register(intent)]));
    return await doc.save();
  } finally {
    profile.dispose();
  }
}
