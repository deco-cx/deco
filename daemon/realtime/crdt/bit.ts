export class BinaryIndexedTree {
  bit: Map<number, number>;
  upperLimit: number;

  constructor(upperLimit: number = 10_000_000) {
    this.bit = new Map();
    this.upperLimit = upperLimit;
  }

  private increase(idx: number, delta: number): void {
    let currValue = this.bit.get(idx) || 0;
    this.bit.set(idx, currValue + delta);
  }

  // Updates the value at index idx by adding delta to it
  update(idx: number, delta: number): void {
    idx++; // Convert 0-based indexing to 1-based indexing
    while (idx <= this.upperLimit) {
      this.increase(idx, delta);
      idx += idx & -idx; // Move to next index
    }
  }

  private getSum(r: number): number {
    let sum = 0;
    while (r > 0) {
      sum += this.bit.get(r) || 0;
      r -= r & -r; // Move to parent index
    }
    return sum;
  }

  // Returns the sum of values in the range [0, i]
  query(r: number): number {
    r++; // Convert 0-based indexing to 1-based indexing
    return this.getSum(r);
  }

  // Returns the sum of values in the range [left, right]
  rangeQuery(left: number, right: number): number {
    return this.query(right) - this.query(left - 1);
  }
}
