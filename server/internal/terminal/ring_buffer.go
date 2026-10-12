package terminal

import (
	"errors"
)

var ErrBufferFull = errors.New("terminal subscriber buffer full")

// dynamicRingBuffer is an elastic circular byte buffer.
// It is not thread-safe by itself; access must be synchronized by the caller.
type dynamicRingBuffer struct {
	buf    []byte
	head   int
	tail   int
	count  int
	maxCap int
}

func newDynamicRingBuffer(initialCap, maxCap int) *dynamicRingBuffer {
	if initialCap <= 0 {
		initialCap = 64 * 1024 // 64 KB default
	}
	if maxCap <= 0 {
		maxCap = 8 * 1024 * 1024 // 8 MB default max capacity
	}
	if initialCap > maxCap {
		initialCap = maxCap
	}
	return &dynamicRingBuffer{
		buf:    make([]byte, initialCap),
		maxCap: maxCap,
	}
}

func (r *dynamicRingBuffer) Len() int {
	return r.count
}

func (r *dynamicRingBuffer) Cap() int {
	return len(r.buf)
}

func (r *dynamicRingBuffer) MaxCap() int {
	return r.maxCap
}

func (r *dynamicRingBuffer) grow(needed int) bool {
	currentCap := len(r.buf)
	if currentCap >= r.maxCap {
		return false
	}
	newCap := currentCap * 2
	if newCap < needed {
		newCap = needed
	}
	if newCap > r.maxCap {
		newCap = r.maxCap
	}
	if newCap <= currentCap {
		return false
	}

	newBuf := make([]byte, newCap)
	if r.count > 0 {
		if r.head < r.tail {
			copy(newBuf, r.buf[r.head:r.tail])
		} else {
			n1 := copy(newBuf, r.buf[r.head:])
			copy(newBuf[n1:], r.buf[:r.tail])
		}
	}
	r.buf = newBuf
	r.head = 0
	r.tail = r.count
	return len(r.buf) >= needed
}

func (r *dynamicRingBuffer) Write(p []byte) (int, error) {
	n := len(p)
	if n == 0 {
		return 0, nil
	}

	available := len(r.buf) - r.count
	if n > available {
		needed := r.count + n
		if !r.grow(needed) {
			spaceLeft := r.maxCap - r.count
			if spaceLeft <= 0 {
				return 0, ErrBufferFull
			}
			if n > spaceLeft {
				n = spaceLeft
				p = p[:n]
			}
		}
	}

	if r.tail+n <= len(r.buf) {
		copy(r.buf[r.tail:], p)
		r.tail += n
		if r.tail == len(r.buf) {
			r.tail = 0
		}
	} else {
		firstPart := len(r.buf) - r.tail
		copy(r.buf[r.tail:], p[:firstPart])
		copy(r.buf[:], p[firstPart:])
		r.tail = n - firstPart
	}

	r.count += n
	return n, nil
}

func (r *dynamicRingBuffer) PopChunk(maxBytes int) []byte {
	if r.count == 0 {
		return nil
	}
	toRead := r.count
	if maxBytes > 0 && toRead > maxBytes {
		toRead = maxBytes
	}

	res := make([]byte, toRead)
	if r.head+toRead <= len(r.buf) {
		copy(res, r.buf[r.head:r.head+toRead])
		r.head += toRead
		if r.head == len(r.buf) {
			r.head = 0
		}
	} else {
		firstPart := len(r.buf) - r.head
		copy(res, r.buf[r.head:])
		copy(res[firstPart:], r.buf[:toRead-firstPart])
		r.head = toRead - firstPart
	}
	r.count -= toRead

	if r.count == 0 {
		r.head = 0
		r.tail = 0
	}

	return res
}
