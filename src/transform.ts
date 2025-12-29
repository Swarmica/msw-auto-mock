import vm from "node:vm"
import { OpenAPIV3 } from "openapi-types"
import merge from "lodash/merge"
import camelCase from "lodash/camelCase"
import { ConfigOptions } from "./types"
import { isValidRegExp } from "./utils"

export interface ResponseMap {
  code: string
  id: string
  responses?: Record<string, OpenAPIV3.SchemaObject>
}

export interface Operation {
  verb: string
  path: string
  response: ResponseMap[]
}

export type OperationCollection = Operation[]

export function getResIdentifierName(res: ResponseMap) {
  if (!res.id) {
    return ""
  }
  return camelCase(`get ${res.id}${res.code}Response`)
}

export function transformToGenerateResultFunctions(
  operationCollection: OperationCollection,
  baseURL: string,
): string {
  const context = {
    baseURL: baseURL ?? "",
    result: null,
  }
  vm.createContext(context)

  return operationCollection
    .map(op =>
      op.response
        .map(r => {
          const name = getResIdentifierName(r)
          if (!name) {
            return ""
          }

          if (!r.responses) {
            return
          }
          const jsonResponseKey = Object.keys(r.responses).filter(r =>
            r.startsWith("application/json"),
          )[0]
          const result = transformJSONSchemaToCode(r.responses?.[jsonResponseKey])

          vm.runInContext(`result = ${result};`, context)

          return [
            `export function `,
            `${name}() { `,
            `return ${JSON.stringify(context.result)} `,
            `};\n`,
          ].join("\n")
        })
        .join("\n"),
    )
    .join("\n")
}

export function transformToHandlerCode(
  operationCollection: OperationCollection,
  options: ConfigOptions,
): string {
  return operationCollection
    .map(op => {
      return `http.${op.verb}(\`\${baseURL}${op.path}\`, async () => {
        const resultArray = [${op.response.map(response => {
          const identifier = getResIdentifierName(response)
          const result =
            parseInt(response?.code!) === 204
              ? `[undefined, { status: ${parseInt(response?.code!)} }]`
              : `[${identifier ? `${identifier}()` : "undefined"}, { status: ${parseInt(response?.code!)} }]`

          return result
        })}]${options.typescript ? `as [any, { status: number }][]` : ""};

          return HttpResponse.json(...resultArray[0])
        }),\n`
    })
    .join("  ")
    .trimEnd()
}

export function transformJSONSchemaToCode(
  jsonSchema?: OpenAPIV3.SchemaObject,
  key?: string,
): string {
  if (!jsonSchema) {
    return "null"
  }

  if (jsonSchema.example !== undefined) {
    return JSON.stringify(jsonSchema.example)
  }

  if (Array.isArray(jsonSchema.type)) {
    return transformJSONSchemaToCode({ ...jsonSchema, type: jsonSchema.type[0] }, key)
  }

  if (jsonSchema.enum) {
    return JSON.stringify(jsonSchema.enum[0])
  }

  if (jsonSchema.allOf) {
    const { allOf, ...rest } = jsonSchema
    return transformJSONSchemaToCode(merge({}, ...allOf, rest), key)
  }

  if (jsonSchema.oneOf) {
    return transformJSONSchemaToCode(jsonSchema.oneOf[0] as OpenAPIV3.SchemaObject, key)
  }

  if (jsonSchema.anyOf) {
    return transformJSONSchemaToCode(jsonSchema.anyOf[0] as OpenAPIV3.SchemaObject, key)
  }

  switch (jsonSchema.type) {
    case "string":
      return transformStringBasedOnFormat(jsonSchema, key)

    case "number":
    case "integer": {
      if (typeof jsonSchema.minimum === "number") {
        return String(jsonSchema.minimum)
      }
      if (typeof jsonSchema.maximum === "number") {
        return String(jsonSchema.maximum)
      }
      return "1"
    }

    case "boolean":
      return "true"

    case "object": {
      if (!jsonSchema.properties && typeof jsonSchema.additionalProperties === "object") {
        return `{
          "key": ${transformJSONSchemaToCode(
            jsonSchema.additionalProperties as OpenAPIV3.SchemaObject,
          )}
        }`
      }

      return `{
        ${Object.entries(jsonSchema.properties ?? {})
          .map(([k, v]) => {
            return `${JSON.stringify(k)}: ${transformJSONSchemaToCode(
              v as OpenAPIV3.SchemaObject,
              k,
            )}`
          })
          .join(",\n")}
      }`
    }

    case "array": {
      const length = jsonSchema.minItems ?? 1
      const itemValue = transformJSONSchemaToCode(jsonSchema.items as OpenAPIV3.SchemaObject)

      return `[${Array.from({ length })
        .map(() => itemValue)
        .join(", ")}]`
    }

    default:
      return "null"
  }
}
/**
 * See https://json-schema.org/understanding-json-schema/reference/string.html#built-in-formats
 */
function transformStringBasedOnFormat(
  schema: OpenAPIV3.NonArraySchemaObject,
  key?: string,
): string {
  const { format, minLength, maxLength, pattern } = schema
  const lowerKey = key?.toLowerCase()

  if (format === "date-time" || lowerKey?.endsWith("_at")) {
    return `"2020-01-01T00:00:00.000Z"`
  }

  if (format === "time") {
    return `"00:00"`
  }

  if (format === "date") {
    return `"2020-01-01"`
  }

  if (format === "uuid" || lowerKey === "id" || lowerKey?.endsWith("id")) {
    return `"abcd-abcd-abcd"`
  }

  if (["idn-email", "email"].includes(format ?? "") || lowerKey?.includes("email")) {
    return `"email@example.com"`
  }

  if (["hostname", "idn-hostname"].includes(format ?? "")) {
    return `"example.com"`
  }

  if (format === "ipv4") {
    return `"127.0.0.1"`
  }

  if (format === "ipv6") {
    return `"::1"`
  }

  if (
    ["uri", "uri-reference", "iri", "iri-reference", "uri-template"].includes(format ?? "") ||
    lowerKey?.includes("url")
  ) {
    if (["photo", "image", "picture"].some(image => lowerKey?.includes(image))) {
      return `"https://example.com/image.png"`
    }
    return `"https://example.com"`
  }

  if (lowerKey?.endsWith("name")) {
    return `"John Doe"`
  }

  if (lowerKey?.includes("street")) {
    return `"123 Main Street"`
  }

  if (lowerKey?.includes("city")) {
    return `"New-York"`
  }

  if (lowerKey?.includes("state")) {
    return `"USA"`
  }

  if (lowerKey?.includes("zip")) {
    return `"12345"`
  }

  if (minLength || maxLength) {
    const length = minLength ?? Math.min(maxLength ?? 10, 10)

    return `"${"a".repeat(length)}"`
  }

  if (pattern && isValidRegExp(pattern)) {
    return `"pattern"`
  }

  return `"lorem ipsum dolor"`
}
