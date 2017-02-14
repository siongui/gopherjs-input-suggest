package suggest

import (
	. "github.com/siongui/godom"
)

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

// initialization function
func BindSuggest(id string, fnSugguestWords func(string) []string) *SuggestMenuStateMachine {
	input := Document.GetElementById(id)
	appendCssToHead()

	// insert suggest-menu after input
	sm := createSuggestMenu()
	input.AppendAfter(sm)

	state := NewSuggestMenuStateMachine(input, sm, fnSugguestWords)

	input.AddEventListener("keyup", func(e Event) {
		keyEventHandler(e.KeyCode(), state)
	})

	return state
}
