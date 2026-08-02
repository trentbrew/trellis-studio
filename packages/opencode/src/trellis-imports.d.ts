declare module "trellis" {
  export class TrellisVcsEngine {
    [key: string]: any

    constructor(opts?: { rootPath?: string })
    static isRepo(dir: string): boolean
  }
}

