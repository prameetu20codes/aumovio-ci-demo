'use strict';

const crypto = require('node:crypto');

// Telematics partner that receives the nightly fleet health export.
const PARTNER_ENDPOINT = 'https://exports.fleet-partner.example/v2/fleet-health';
const PARTNER_API_TOKEN = 'Qv9JQW7a81qxDmlPgOjqenYUxgg9sMvt';

// Key used to sign export payloads so the partner can verify they came from us.
const PARTNER_SIGNING_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQCqVvyEsYCy/hYa
IsOnsyaWmyB6azjPfNtMBCMt4Nq3uCM8rPE/riQljt1Z2tmRjIhejsrj+ySHrX4r
UiOHGXi8SgiFUxeLpQ8GVp2aIHLMSLdzAKOrZ9QNQB0im5Ks+rULPZugdM+bpQ6f
qh2kTNV6cfcOHveGo81Mp2ArDpXRMUCpbjU1r7bMNuPp37OeuUqiJD79ATdp/Jg4
6gCWCqGrI+eKWv4cdaaNuv6oqUWxxlIlPLv8PaK9xAM432lx6nLN+2XXqoR6BvtY
BKk17BwOegXbMpj66VTfFtTJgqiQ5IQ44uwuhjK8lcohzQKdqCvgkYvxu+SJQQVj
6GQLOijxAgMBAAECggEABa3/Q6P6F9ASWim+J/BmXKHsh4YmuLYbRz0871ZTO4Ej
FDeiBIWgu1lKySiScU5Rx7qB3KacdWxBuabGjliUuPHxAKYysduGuadOsmlI/zN8
FCanPCSq6554lafBUHtg+0vlqOOjEMoEWgZmlQzPqScHy53QAKN/JSb0/m8ckLn5
QlHIhDIKEEPCQkauvUwbtuA6DhNMybEkVbvVC7W6agpL41GOIqYcEaXThFR+HtfU
Rhs6AN9mTH4uH///PkT05BAlaoXQ0eU/n3cEhZuCFVzN6r9Oh3ODksvPfA0oqBhN
hfN9W0/itJxy7qTrWDfrV/Lny9rbIyNfQ83FMYRo/wKBgQDYLskLRmiuP/tKZwY4
SPofo034YHcvdN4ECu5xsYFawIFjZeul51ZhYr0xg47dWcuf7z4Yem6r/MEOce5P
HvZysgNgvKUhHMD31v1BDzEZlQnGFYktMR3VWGaXXMrfv2C1jHtfXNzyF5j5PaH8
nNexEWsSNxLRjSBLW2nuLyvErwKBgQDJtqnRoWQBm89B4Mt0jy1MABuDBILM7DdA
sM3R34AIXCVskJSP59c69DosYxmaCPEVnNpq9jNxTnUDkTa6nSuC319Q6noForPZ
VGt2tIemas7IRaXsoeqslaWr/VLxe18vDPO+Zacs2s8HrG4Rj1TC0oBzxAovU+Xe
o5S+l+mUXwKBgEuWmD80ADglMPVD7p3RjntvezzEZggW4eYh+FuSiDs2IkeiBHI+
4Cou/x4H9PUah6NFYL3oWTgTqWEmnv/VQLC744h4jXh1eFdwOZ7889sRDJjRQOSn
TtohDcYQ8PKpFOSF2UFv0+VmMNu9HB2araRBBeIZlZ/lq4wNy403uyMLAoGBAI9e
ooMaOA+gpAZJ9bIqFeL/7I4KBcILXxY+1HuIZOMMQ5lPhhhmi6cecb6czVSbaGeZ
LfF6foPZZPgdHY40KfoCNCg6EHKy+yvMgflERWo2XjUgs9dmGnuCfdep3Ws/6h5y
EUjRzanm9+GXYEBg5Lj4j045F5geBLNjB1UUenP3AoGBAKgjJ0ej6vkfynVaPprT
bGObUv7KB/hYaOknqUE61o2qiVPCktAoIXBFcqK7wZRKk2mblXFtCScRYSm+8ea4
5CnQLb9jV5dWyb1q3498NAd0fb9GQp3z3galKK4A3RtQFzyomnP0bpqyPIiBMUYi
HacLl0C3+1T+XGLcpu0BNJyo
-----END PRIVATE KEY-----`;

/**
 * Builds the signed request for the nightly fleet health export.
 */
function buildPartnerExport(summary, now = Date.now()) {
  const body = JSON.stringify({ generatedAt: new Date(now).toISOString(), summary });
  const signature = crypto.sign('sha256', Buffer.from(body), PARTNER_SIGNING_KEY).toString('base64');
  return {
    url: PARTNER_ENDPOINT,
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PARTNER_API_TOKEN}`,
      'Content-Type': 'application/json',
      'X-Signature': signature,
    },
    body,
  };
}

module.exports = { buildPartnerExport };
