import SwaggerParser from "@apidevtools/swagger-parser";

const file = new URL("../openapi/aro-v1.yaml", import.meta.url).pathname;
const api = await SwaggerParser.validate(file);
console.log(`OpenAPI valid: ${api.info.title} ${api.info.version}`);
