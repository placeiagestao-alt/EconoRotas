ALTER TABLE `users`
  ADD COLUMN `phone` varchar(32),
  ADD COLUMN `companyName` varchar(255),
  ADD COLUMN `city` varchar(128),
  ADD COLUMN `state` varchar(64),
  ADD COLUMN `vehicleType` varchar(64),
  ADD COLUMN `acceptedTermsAt` timestamp NULL;
