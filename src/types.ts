export interface CliOptions {
  output: string
  includes?: string
  excludes?: string
  baseUrl?: string | true
  codes?: string
  typescript?: boolean
}

export type ConfigOptions = CliOptions
