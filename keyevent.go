package suggest

import (
	"github.com/gopherjs/gopherjs/js"
	gojs "github.com/siongui/gopherjs-utils"
	"strings"
)

const (
	TAB    = 9
	RETURN = 13
	ESC    = 27
	UP     = 38
	DOWN   = 40
)

func appendWords(sm *js.Object, words []string) {
	gojs.RemoveAllChildNodes(sm)
	for _, word := range words {
		div := js.Global.Get("document").Call("createElement", "div")
		div.Set("textContent", word)
		sm.Call("appendChild", div)
	}
	sm.Get("classList").Call("remove", "invisible")
}

func setSuggestMenuStyle(input, sm *js.Object) {
	rect := gojs.GetPosition(input)
	sm.Get("style").Set("left", rect.Left+"px")
	sm.Get("style").Set("minWidth", rect.Width+"px")
}

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
