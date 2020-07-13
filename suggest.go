package suggest

import (
	. "github.com/siongui/godom"
)

var state *SuggestMenuStateMachine

// insert style of suggest-menu at the end of head element
func appendCssToHead() {
	s := Document.CreateElement("style")
	s.SetInnerHTML(css)
	Document.QuerySelector("head").AppendChild(s)
}

func createSuggestMenu() *Object {
	sm := Document.CreateElement("div")
	sm.ClassList().Add("suggest")
	sm.ClassList().Add("invisible")
	return sm
}

func UpdateSuggestion() {
	w := state.GetWord()
	if w == "" {
		state.OriginalWord = ""
		state.HideSuggestMenu()
	} else {
		state.UpdateSuggestMenu(w)
	}
}

func HideSuggestion() {
	state.HideSuggestMenu()
}

// initialization function
func BindSuggest(id string, fnSugguestWords func(string) []string) *SuggestMenuStateMachine {
	input := Document.GetElementById(id)
	appendCssToHead()

	// insert suggest-menu after input
	sm := createSuggestMenu()
	input.AppendAfter(sm)

	state = NewSuggestMenuStateMachine(input, sm, fnSugguestWords)

	input.AddEventListener("keyup", func(e Event) {
		keyEventHandler(e.KeyCode())
	})

	return state
}
