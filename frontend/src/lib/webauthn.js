export const b64uToBuf = (str) => {
    if (!str) return new Uint8Array();
    const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4 || 4)) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
};

export const bufToB64u = (buf) => {
    const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : new Uint8Array(buf.buffer || buf);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

export function serializePublicKeyCredential(cred) {
    const clientDataJSON = bufToB64u(cred.response.clientDataJSON);
    const attestationObject = cred.response.attestationObject
        ? bufToB64u(cred.response.attestationObject)
        : undefined;
    const authenticatorData = cred.response.authenticatorData
        ? bufToB64u(cred.response.authenticatorData)
        : undefined;
    const signature = cred.response.signature ? bufToB64u(cred.response.signature) : undefined;
    const userHandle = cred.response.userHandle ? bufToB64u(cred.response.userHandle) : undefined;

    return {
        id: cred.id,
        type: cred.type,
        rawId: bufToB64u(cred.rawId),
        response: {
            clientDataJSON,
            attestationObject,
            authenticatorData,
            signature,
            userHandle,
        },
        clientExtensionResults:
            typeof cred.getClientExtensionResults === "function"
                ? cred.getClientExtensionResults()
                : {},
    };
}
