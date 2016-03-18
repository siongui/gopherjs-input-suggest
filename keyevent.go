package suggest

import (
	"github.com/gopherjs/gopherjs/js"
	"strings"
)

const (
	TAB    = 9
	RETURN = 13
	ESC    = 27
	UP     = 38
	DOWN   = 40
)

func keyEventHandler(keycode int, input, sm *js.Object, fnSugguestWords func(string) []string) {
	if keycode == RETURN {
		sm.Get("classList").Call("add", "invisible")
		return
	}

	w := strings.TrimSpace(input.Get("value").String())
	if w == "" {
		sm.Get("classList").Call("add", "invisible")
	} else {
		suggestedWords := fnSugguestWords(w)
		if len(suggestedWords) == 0 {
			sm.Get("classList").Call("add", "invisible")
		} else {
			setSuggestMenuStyle(input, sm)
			appendWords(sm, suggestedWords)
		}
	}
}
