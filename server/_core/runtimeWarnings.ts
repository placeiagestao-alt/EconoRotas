if (process.env.SUPPRESS_NODE_DEPRECATION_WARNINGS === "true") {
  (process as NodeJS.Process & { noDeprecation?: boolean }).noDeprecation = true;
}
