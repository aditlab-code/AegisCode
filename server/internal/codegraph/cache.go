package codegraph

import (
	"container/list"
	"strings"
	"sync"
)

type cacheEntry struct {
	key       string
	value     any
	pathOwner string // relPath associated with this cache entry, if any
}

// LRUCache provides a thread-safe, fixed-capacity LRU cache with path-based invalidation.
type LRUCache struct {
	mu       sync.Mutex
	capacity int
	items    map[string]*list.Element
	evict    *list.List
}

// NewLRUCache creates an LRU cache with the specified item capacity.
func NewLRUCache(capacity int) *LRUCache {
	if capacity <= 0 {
		capacity = 500
	}
	return &LRUCache{
		capacity: capacity,
		items:    make(map[string]*list.Element),
		evict:    list.New(),
	}
}

// Get retrieves an item from the cache and updates its recency.
func (c *LRUCache) Get(key string) (any, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if elem, ok := c.items[key]; ok {
		c.evict.MoveToFront(elem)
		return elem.Value.(*cacheEntry).value, true
	}
	return nil, false
}

// Set stores an item in the cache associated with an optional file path owner.
func (c *LRUCache) Set(key string, value any, pathOwner string) {
	c.mu.Lock()
	defer c.mu.Unlock()

	// Update existing element
	if elem, ok := c.items[key]; ok {
		c.evict.MoveToFront(elem)
		entry := elem.Value.(*cacheEntry)
		entry.value = value
		entry.pathOwner = pathOwner
		return
	}

	// Evict oldest if full
	if c.evict.Len() >= c.capacity {
		oldest := c.evict.Back()
		if oldest != nil {
			c.evict.Remove(oldest)
			oldEntry := oldest.Value.(*cacheEntry)
			delete(c.items, oldEntry.key)
		}
	}

	// Insert new element
	entry := &cacheEntry{key: key, value: value, pathOwner: pathOwner}
	elem := c.evict.PushFront(entry)
	c.items[key] = elem
}

// InvalidatePath removes all entries associated with or mentioning the given path.
func (c *LRUCache) InvalidatePath(path string) {
	if path == "" {
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()

	normPath := strings.ToLower(path)
	for key, elem := range c.items {
		entry := elem.Value.(*cacheEntry)
		if strings.ToLower(entry.pathOwner) == normPath || strings.Contains(strings.ToLower(key), normPath) {
			c.evict.Remove(elem)
			delete(c.items, key)
		}
	}
}

// Clear flushes all cached entries.
func (c *LRUCache) Clear() {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.items = make(map[string]*list.Element)
	c.evict.Init()
}

// Len returns current number of cached items.
func (c *LRUCache) Len() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.evict.Len()
}
