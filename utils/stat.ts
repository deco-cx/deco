// Generated from GPT

class MaxHeap {
  private heap: number[] = [];

  public insert(value: number): void {
    this.heap.push(value);
    this.bubbleUp();
  }

  private bubbleUp(): void {
    let index = this.heap.length - 1;
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this.heap[parentIndex] >= this.heap[index]) break;
      [this.heap[parentIndex], this.heap[index]] = [
        this.heap[index],
        this.heap[parentIndex],
      ];
      index = parentIndex;
    }
  }

  public extractMax(): number | undefined {
    const max = this.heap[0];
    const end = this.heap.pop();
    if (this.heap.length > 0 && end !== undefined) {
      this.heap[0] = end;
      this.sinkDown(0);
    }
    return max;
  }

  private sinkDown(index: number): void {
    const length = this.heap.length;
    const element = this.heap[index];
    while (true) {
      const leftChildIndex = 2 * index + 1;
      const rightChildIndex = 2 * index + 2;
      let leftChild, rightChild;
      let swap = null;

      if (leftChildIndex < length) {
        leftChild = this.heap[leftChildIndex];
        if (leftChild > element) {
          swap = leftChildIndex;
        }
      }

      if (rightChildIndex < length) {
        rightChild = this.heap[rightChildIndex];
        if (
          swap === null && rightChild > element ||
          swap !== null && leftChild && rightChild > leftChild
        ) {
          swap = rightChildIndex;
        }
      }

      if (swap === null) break;
      [this.heap[index], this.heap[swap]] = [this.heap[swap], this.heap[index]];
      index = swap;
    }
  }

  public getMax(): number | undefined {
    return this.heap[0];
  }

  public size(): number {
    return this.heap.length;
  }

  public remove(value: number): boolean {
    const index = this.heap.indexOf(value);
    if (index === -1) return false;

    const end = this.heap.pop();
    if (index < this.heap.length && end !== undefined) {
      this.heap[index] = end;
      this.bubbleUp();
      this.sinkDown(index);
    }
    return true;
  }
}

class MinHeap {
  private heap: number[] = [];

  public insert(value: number): void {
    this.heap.push(value);
    this.bubbleUp();
  }

  private bubbleUp(): void {
    let index = this.heap.length - 1;
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this.heap[parentIndex] <= this.heap[index]) break;
      [this.heap[parentIndex], this.heap[index]] = [
        this.heap[index],
        this.heap[parentIndex],
      ];
      index = parentIndex;
    }
  }

  public extractMin(): number | undefined {
    const min = this.heap[0];
    const end = this.heap.pop();
    if (this.heap.length > 0 && end !== undefined) {
      this.heap[0] = end;
      this.sinkDown(0);
    }
    return min;
  }

  private sinkDown(index: number): void {
    const length = this.heap.length;
    const element = this.heap[index];
    while (true) {
      const leftChildIndex = 2 * index + 1;
      const rightChildIndex = 2 * index + 2;
      let leftChild, rightChild;
      let swap = null;

      if (leftChildIndex < length) {
        leftChild = this.heap[leftChildIndex];
        if (leftChild < element) {
          swap = leftChildIndex;
        }
      }

      if (rightChildIndex < length) {
        rightChild = this.heap[rightChildIndex];
        if (
          swap === null && rightChild < element ||
          swap !== null && leftChild && rightChild < leftChild
        ) {
          swap = rightChildIndex;
        }
      }

      if (swap === null) break;
      [this.heap[index], this.heap[swap]] = [this.heap[swap], this.heap[index]];
      index = swap;
    }
  }

  public getMin(): number | undefined {
    return this.heap[0];
  }

  public size(): number {
    return this.heap.length;
  }

  public remove(value: number): boolean {
    const index = this.heap.indexOf(value);
    if (index === -1) return false;

    const end = this.heap.pop();
    if (index < this.heap.length && end !== undefined) {
      this.heap[index] = end;
      this.bubbleUp();
      this.sinkDown(index);
    }
    return true;
  }
}

export class Median {
  private maxHeap = new MaxHeap();
  private minHeap = new MinHeap();
  private removeCount: { [key: number]: number } = {};
  private values: number[] = [];

  public add(value: number): void {
    this.values.push(value);
    this.addValue(value);

    if (this.values.length > 500) {
      const oldValue = this.values.shift();
      if (oldValue !== undefined) {
        this.removeValue(oldValue);
      }
    }
  }

  public get(): number {
    return this.calculateMedian();
  }

  private addValue(value: number): void {
    if (this.maxHeap.size() === 0 || value <= this.maxHeap.getMax()!) {
      this.maxHeap.insert(value);
    } else {
      this.minHeap.insert(value);
    }

    if (this.maxHeap.size() > this.minHeap.size() + 1) {
      this.minHeap.insert(this.maxHeap.extractMax()!);
    } else if (this.minHeap.size() > this.maxHeap.size()) {
      this.maxHeap.insert(this.minHeap.extractMin()!);
    }
  }

  private removeValue(value: number): void {
    if (value <= this.maxHeap.getMax()!) {
      if (!this.maxHeap.remove(value)) {
        this.removeCount[value] = (this.removeCount[value] || 0) + 1;
      }
    } else {
      if (!this.minHeap.remove(value)) {
        this.removeCount[value] = (this.removeCount[value] || 0) + 1;
      }
    }

    while (
      this.maxHeap.size() > 0 && this.removeCount[this.maxHeap.getMax()!]
    ) {
      this.removeCount[this.maxHeap.getMax()!]--;
      this.maxHeap.extractMax();
    }

    while (
      this.minHeap.size() > 0 && this.removeCount[this.minHeap.getMin()!]
    ) {
      this.removeCount[this.minHeap.getMin()!]--;
      this.minHeap.extractMin();
    }
  }

  private calculateMedian(): number {
    if (this.maxHeap.size() > this.minHeap.size()) {
      return this.maxHeap.getMax()!;
    } else {
      return (this.maxHeap.getMax()! + this.minHeap.getMin()!) / 2;
    }
  }
}
