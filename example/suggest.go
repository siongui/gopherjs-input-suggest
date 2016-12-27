package main

import (
	sg "github.com/siongui/gopherjs-input-suggest"
	"math/rand"
	"time"
)

func RandomString(strlen int) string {
	rand.Seed(time.Now().UTC().UnixNano())
	const chars = "abcdefghijklmnopqrstuvwxyz0123456789"
	result := make([]byte, strlen)
	for i := 0; i < strlen; i++ {
		result[i] = chars[rand.Intn(len(chars))]
	}
	return string(result)
}

func TestString(w string, count int) string {
	const chars = "ABCDEFGHIJKLMNO"
	for i := 0; i < count; i++ {
		w += string(chars[i])
	}
	return w
}

func main() {
	sg.BindSuggest("word", func(w string) []string {
		var result []string
		for i := 0; i < 10; i++ {
			//result = append(result, RandomString(len(w)))
			result = append(result, TestString(w, i))
		}
		return result
	})
}
