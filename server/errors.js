// Every error Lithium throws on purpose is a LithiumError, so you can branch
// on `err.code` instead of parsing message strings.
//
//   try { create_lithium_server({ proxy: "nope" }) }
//   catch (e) { if (e.code === "UNKNOWN_PROXY") console.log(e.details.available) }
//
// Codes: UNKNOWN_PROXY, UNKNOWN_TRANSPORT, INCOMPATIBLE_TRANSPORT,
//        PACKAGE_MISSING, PACKAGE_VERSION_MISMATCH, TRANSPORT_VERSION_MISMATCH,
//        BACKEND_EXISTS, INVALID_BACKEND, INVALID_OPTION
export class LithiumError extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.name = "LithiumError"
    this.code = code
    this.details = details
  }

  toJSON() {
    return { name: this.name, code: this.code, message: this.message, details: this.details }
  }
}
