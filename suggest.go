// Package suggest provides input suggestion menu feature for frontend. This is
// similar to Autocomplete feature of Buefy (https://buefy.org/). The code of
// this library is written in Go and must be compiled to JavaScript via
// GopherJS. The BindSuggest method is initialization function of the input
// suggest. For simple application, using this method once in your application
// initialization code should be enough and it will run automatically. If you
// need to control the behavior of the suggest menu during the runtime of your
// application, use UpdateSuggestion or HideSuggestion methods.
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
	sm.ClassList().Add("invisible-used-in-suggest")
	return sm
}

// UpdateSuggestion will read the value of input element and update suggest menu
// accordingly.
func UpdateSuggestion() {
	w := state.GetWord()
	if w == "" {
		state.OriginalWord = ""
		state.HideSuggestMenu()
	} else {
		state.UpdateSuggestMenu(w)
	}
}

// HideSuggestion will hide the input suggest menu.
func HideSuggestion() {
	state.HideSuggestMenu()
}

// BindSuggest is the initialization function for the input suggest feature.
// The first argument is the id of the input element. The second argument is a
// function implemented by you. Given a string, the function will return
// possible suggest strings for users to choose.
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
