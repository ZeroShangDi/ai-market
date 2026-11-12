declare module "crypto-js" {
  const CryptoJS: {
    enc: { Utf8: { parse(value: string): unknown } };
    AES: {
      encrypt(
        value: unknown,
        key: unknown,
        options: unknown,
      ): { toString(): string };
    };
    mode: { ECB: unknown };
    pad: { Pkcs7: unknown };
  };
  export default CryptoJS;
}
