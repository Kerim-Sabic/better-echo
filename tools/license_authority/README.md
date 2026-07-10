# Horalix License Authority

This is an offline operator tool, deliberately separate from the clinical server.
Keep its Ed25519 private key in restricted company-controlled storage. Never put
that key in a customer installation, `.env` file, Git repository, or support bundle.

## One-time key creation

```powershell
python -m tools.license_authority generate-keypair `
  --private-key-out C:\secure\horalix-license-private.pem `
  --public-key-out C:\secure\horalix-license-public.pem
```

Put the public key (base64 raw form or PEM) in the server's
`LICENSE_PUBLIC_KEY_B64` configuration. Protect and back up the private key
separately; losing it prevents issuing renewals for the installed public key.

## Issuing a license

1. On the customer server, download the loopback-only activation request from
   `GET /api/licensing/activation-request`.
2. Transfer that JSON file to the secure authority workstation.
3. Issue the license:

```powershell
python -m tools.license_authority issue `
  --private-key C:\secure\horalix-license-private.pem `
  --activation-request C:\secure\customer-activation.json `
  --customer-name "Example Hospital" `
  --expires-at "2027-01-31T00:00:00Z" `
  --feature core --feature llm `
  --output C:\secure\example-hospital-license.json
```

4. Transfer only the generated license JSON back to the customer and import it
   using the loopback-only `POST /api/licensing/import` endpoint.

The tool refuses to overwrite keys or license files and validates the activation
request fingerprint and expiry timestamp before signing.
