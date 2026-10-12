package terminal

import (
	"bytes"
	"fmt"
	"testing"
)

func TestRingBufferBasicWriteAndPop(t *testing.T) {
	rb := newDynamicRingBuffer(64, 1024)

	if rb.Len() != 0 {
		t.Fatalf("expected 0 len, got %d", rb.Len())
	}

	data := []byte("hello world")
	n, err := rb.Write(data)
	if err != nil || n != len(data) {
		t.Fatalf("write failed: n=%d, err=%v", n, err)
	}

	if rb.Len() != len(data) {
		t.Fatalf("expected len %d, got %d", len(data), rb.Len())
	}

	popped := rb.PopChunk(32)
	if !bytes.Equal(popped, data) {
		t.Fatalf("expected %q, got %q", string(data), string(popped))
	}

	if rb.Len() != 0 {
		t.Fatalf("expected 0 len after pop, got %d", rb.Len())
	}
}

func TestRingBufferDynamicGrowthAndWrap(t *testing.T) {
	initialCap := 32
	maxCap := 512
	rb := newDynamicRingBuffer(initialCap, maxCap)

	// Write 20 bytes
	part1 := bytes.Repeat([]byte("A"), 20)
	if _, err := rb.Write(part1); err != nil {
		t.Fatalf("write part1 failed: %v", err)
	}

	// Pop 15 bytes -> head moves forward
	p1 := rb.PopChunk(15)
	if len(p1) != 15 || !bytes.Equal(p1, bytes.Repeat([]byte("A"), 15)) {
		t.Fatalf("pop 15 failed, got %d bytes", len(p1))
	}

	// Write 30 bytes -> causes wrap-around and expansion
	part2 := bytes.Repeat([]byte("B"), 30)
	if _, err := rb.Write(part2); err != nil {
		t.Fatalf("write part2 failed: %v", err)
	}

	expectedRemainingA := bytes.Repeat([]byte("A"), 5)
	allPopped := rb.PopChunk(100)
	expectedTotal := append(expectedRemainingA, part2...)

	if !bytes.Equal(allPopped, expectedTotal) {
		t.Fatalf("expected %s, got %s", string(expectedTotal), string(allPopped))
	}
}

func TestRingBufferLargeSequentialStream(t *testing.T) {
	rb := newDynamicRingBuffer(1024, 2*1024*1024)

	var written bytes.Buffer
	for i := 0; i < 5000; i++ {
		line := fmt.Sprintf("line_%05d\n", i)
		written.WriteString(line)
		if _, err := rb.Write([]byte(line)); err != nil {
			t.Fatalf("write error at line %d: %v", i, err)
		}
	}

	var read bytes.Buffer
	for rb.Len() > 0 {
		chunk := rb.PopChunk(4096)
		read.Write(chunk)
	}

	if !bytes.Equal(written.Bytes(), read.Bytes()) {
		t.Fatalf("data mismatch in large sequential stream: wrote %d bytes, read %d bytes", written.Len(), read.Len())
	}
}

func TestRingBufferMaxCapLimit(t *testing.T) {
	maxCap := 256
	rb := newDynamicRingBuffer(64, maxCap)

	data := bytes.Repeat([]byte("X"), 300)
	n, err := rb.Write(data)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if n != maxCap {
		t.Fatalf("expected written %d bytes, got %d", maxCap, n)
	}

	// Buffer is now completely full
	n2, err := rb.Write([]byte("overflow"))
	if err != ErrBufferFull || n2 != 0 {
		t.Fatalf("expected ErrBufferFull, got n=%d, err=%v", n2, err)
	}
}
