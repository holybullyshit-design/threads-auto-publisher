// Internal identifiers belong in storage, never in customer-facing captions.
function publicCaption(value) {
  return String(value || '').replace(/#자동게시_[^\s#]+/gu, '').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function assertPublicCaption(value) {
  if (/#자동게시_[^\s#]+/u.test(String(value || ''))) {
    throw Object.assign(new Error('내부 게시 관리 코드가 포함되어 발행을 차단했습니다.'), {code:'INTERNAL_CAPTION'});
  }
}

function captionMatches(actual, expected, legacyMarker) {
  if (legacyMarker && String(actual || '').includes(legacyMarker)) return true;
  const clean = publicCaption(expected).normalize('NFC');
  return Boolean(clean) && publicCaption(actual).normalize('NFC') === clean;
}

module.exports = {publicCaption, assertPublicCaption, captionMatches};
