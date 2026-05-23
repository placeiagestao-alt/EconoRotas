import { startServer } from "./index";

startServer().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
