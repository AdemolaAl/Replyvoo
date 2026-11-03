'use strict';
// Validates the avatar ("Moji") settings people pick at sign-up.
function cleanMoji(m) {
  m = m || {};
  return {
    gender: ['female', 'male', 'other'].includes(m.gender) ? m.gender : 'other',
    skin: Math.min(4, Math.max(0, m.skin | 0)), hair: Math.min(3, Math.max(0, m.hair | 0)),
    glasses: !!m.glasses, beard: !!m.beard, earrings: !!m.earrings
  };
}
module.exports = { cleanMoji };
