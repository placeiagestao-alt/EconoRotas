ALTER TABLE `stops`
  ADD COLUMN `sourceProvider` enum('manual','shopee','imile','mercado_livre','amazon','correios','generic') NOT NULL DEFAULT 'generic',
  ADD COLUMN `originalStop` int,
  ADD COLUMN `isUnsequencedStop` boolean NOT NULL DEFAULT false,
  ADD COLUMN `metadata` json;
