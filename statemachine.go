package suggest

import (
	"github.com/gopherjs/gopherjs/js"
	"strings"
)

type SuggestMenuStateMachine struct {
	Input             *js.Object
	SuggestMenu       *js.Object
	FuncSugguestWords func(string) []string
}

func NewSuggestMenuStateMachine(input, sm *js.Object, fnSugguestWords func(string) []string) *SuggestMenuStateMachine {
	return &SuggestMenuStateMachine{
		Input:             input,
		SuggestMenu:       sm,
		FuncSugguestWords: fnSugguestWords,
	}
}

func (s *SuggestMenuStateMachine) GetWord() string {
	return strings.TrimSpace(s.Input.Get("value").String())
}

func (s *SuggestMenuStateMachine) HideSuggestMenu() {
	s.SuggestMenu.Get("classList").Call("add", "invisible")
}
