// Minimal EXIF date/orientation reader for JPEG files (no dependency).
// HEIC/PNG/etc fall back to file.lastModified in app.js.
function readExifDate(arrayBuffer) {
  try {
    const view = new DataView(arrayBuffer);
    if (view.getUint16(0, false) !== 0xffd8) return null; // not a JPEG

    let offset = 2;
    const length = view.byteLength;
    while (offset < length) {
      const marker = view.getUint16(offset, false);
      offset += 2;
      if (marker === 0xffe1) {
        const exifLength = view.getUint16(offset, false);
        const exifStart = offset + 2;
        if (view.getUint32(exifStart, false) !== 0x45786966) return null; // "Exif"
        return parseExifBlock(view, exifStart + 6);
      } else if ((marker & 0xff00) !== 0xff00) {
        break;
      } else {
        const segLength = view.getUint16(offset, false);
        offset += segLength;
      }
    }
  } catch (e) {
    // corrupt/unsupported file, ignore
  }
  return null;
}

function parseExifBlock(view, tiffStart) {
  const little = view.getUint16(tiffStart, false) === 0x4949;
  const firstIFDOffset = view.getUint32(tiffStart + 4, little);
  const ifd0 = tiffStart + firstIFDOffset;

  const readString = (entryOffset, count) => {
    let s = '';
    for (let i = 0; i < count - 1; i++) {
      s += String.fromCharCode(view.getUint8(entryOffset + i));
    }
    return s;
  };

  const parseIFD = (ifdOffset) => {
    const entries = view.getUint16(ifdOffset, little);
    const tags = {};
    for (let i = 0; i < entries; i++) {
      const entryOffset = ifdOffset + 2 + i * 12;
      const tag = view.getUint16(entryOffset, little);
      const type = view.getUint16(entryOffset + 2, little);
      const count = view.getUint32(entryOffset + 4, little);
      let valueOffset = entryOffset + 8;
      const typeSize = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 9: 4, 10: 8 }[type] || 1;
      const totalSize = typeSize * count;
      if (totalSize > 4) {
        valueOffset = tiffStart + view.getUint32(entryOffset + 8, little);
      }
      tags[tag] = { type, count, valueOffset };
    }
    return tags;
  };

  const tags0 = parseIFD(ifd0);

  // Orientation lives in IFD0 (tag 0x0112)
  let orientation = 1;
  if (tags0[0x0112]) orientation = view.getUint16(tags0[0x0112].valueOffset, little);

  // DateTimeOriginal lives in the Exif sub-IFD (tag 0x8769 points to it)
  let dateStr = null;
  if (tags0[0x9003]) {
    dateStr = readString(tags0[0x9003].valueOffset, tags0[0x9003].count);
  } else if (tags0[0x8769]) {
    const subTags = parseIFD(tiffStart + readLongDirect(view, tags0[0x8769], tiffStart, little));
    if (subTags[0x9003]) dateStr = readString(subTags[0x9003].valueOffset, subTags[0x9003].count);
    else if (subTags[0x0132]) dateStr = readString(subTags[0x0132].valueOffset, subTags[0x0132].count);
  } else if (tags0[0x0132]) {
    dateStr = readString(tags0[0x0132].valueOffset, tags0[0x0132].count);
  }

  let dateMs = null;
  if (dateStr) {
    // format: "YYYY:MM:DD HH:MM:SS"
    const m = dateStr.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
    if (m) {
      dateMs = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
    }
  }

  return { dateMs, orientation };
}

function readLongDirect(view, entry, tiffStart, little) {
  // entry.valueOffset was already resolved assuming totalSize<=4 means it's the direct value location;
  // for a LONG (type 4, count 1) totalSize is exactly 4 so valueOffset already points at the value bytes.
  return view.getUint32(entry.valueOffset, little);
}
