export class BitWriter {
  private bytes: number[] = [];
  private cur = 0;
  private n = 0;

  write(value: number, bits: number): void {
    for (let i = bits - 1; i >= 0; i--) {
      this.cur = (this.cur << 1) | ((value >> i) & 1);
      if (++this.n === 8) {
        this.bytes.push(this.cur);
        this.cur = 0;
        this.n = 0;
      }
    }
  }

  writeBytes(data: Uint8Array): void {
    for (const b of data) this.write(b, 8);
  }

  finish(): Uint8Array {
    if (this.n > 0) {
      this.bytes.push(this.cur << (8 - this.n));
      this.cur = 0;
      this.n = 0;
    }
    return Uint8Array.from(this.bytes);
  }
}

export class BitReader {
  private pos = 0;
  constructor(private readonly bytes: Uint8Array) {}

  read(bits: number): number {
    let v = 0;
    for (let i = 0; i < bits; i++) {
      const byte = this.bytes[this.pos >> 3];
      if (byte === undefined) throw new RangeError('BitReader: данные закончились');
      v = (v << 1) | ((byte >> (7 - (this.pos & 7))) & 1);
      this.pos++;
    }
    return v;
  }

  readBytes(n: number): Uint8Array {
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) out[i] = this.read(8);
    return out;
  }
}
