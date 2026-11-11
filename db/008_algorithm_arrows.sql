-- Swap arrows for PLL illustrations: "FROM->TO:cor,..." as produced by CubeIcons nxnStickerMapToArrows.
-- Empty when the case is not a pure permutation (no arrow is drawn rather than a wrong one).
ALTER TABLE algorithms ADD COLUMN IF NOT EXISTS arrows text NOT NULL DEFAULT '';
