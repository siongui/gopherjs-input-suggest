package suggest

import (
	"github.com/gopherjs/gopherjs/js"
	gojs "github.com/siongui/gopherjs-utils"
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

func keyEventHandler(keycode int, state *SuggestMenuStateMachine) {
	if keycode == RETURN {
		state.HideSuggestMenu()
		return
	}

	w := state.GetWord()
	if w == "" {
		state.HideSuggestMenu()
	} else {
		suggestedWords := state.FuncSugguestWords(w)
		if len(suggestedWords) == 0 {
			state.HideSuggestMenu()
		} else {
			setSuggestMenuStyle(state.Input, state.SuggestMenu)
			appendWords(state.SuggestMenu, suggestedWords)
		}
	}
}
