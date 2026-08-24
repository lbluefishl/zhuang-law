// Groups records by shared content_identifier and flags the video half of each
// Live Photo pair — see §5/§8. Both halves still get their own `media` row; the
// flag is what keeps the video out of the gallery/reel as a standalone item.
export function pairLivePhotos(records) {
  const byContentId = new Map();
  for (const record of records) {
    if (!record.contentIdentifier) continue;
    if (!byContentId.has(record.contentIdentifier)) byContentId.set(record.contentIdentifier, []);
    byContentId.get(record.contentIdentifier).push(record);
  }

  for (const group of byContentId.values()) {
    const photo = group.find((r) => r.mediaType === 'photo');
    const video = group.find((r) => r.mediaType === 'video');
    if (!photo || !video) continue;
    video.isLivePhotoVideo = true;

    // A fair number of stills in this backlog lost their EXIF date somewhere
    // along the way (messaging apps, re-encodes) while their paired video kept
    // its Track Create Date, or vice versa — borrow across the pair.
    if (!photo.dateTaken && video.dateTaken) photo.dateTaken = video.dateTaken;
    if (!video.dateTaken && photo.dateTaken) video.dateTaken = photo.dateTaken;
  }

  return records;
}
