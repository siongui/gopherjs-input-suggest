package suggest

import (
	"github.com/gopherjs/gopherjs/js"
	gojs "github.com/siongui/gopherjs-utils"
	"strings"
)

type SuggestMenuStateMachine struct {
	Input                    *js.Object
	SuggestMenu              *js.Object
	FuncSugguestWords        func(string) []string
	CurrentSelectedWordIndex int
	IsShowSuggestMenu        bool
	SuggestedWordsDivs       []*js.Object
}

func NewSuggestMenuStateMachine(input, sm *js.Object, fnSugguestWords func(string) []string) *SuggestMenuStateMachine {
	return &SuggestMenuStateMachine{
		Input:                    input,
		SuggestMenu:              sm,
		FuncSugguestWords:        fnSugguestWords,
		CurrentSelectedWordIndex: -1,
		IsShowSuggestMenu:        false,
	}
}

func (s *SuggestMenuStateMachine) GetWord() string {
	return strings.TrimSpace(s.Input.Get("value").String())
}

func (s *SuggestMenuStateMachine) HideSuggestMenu() {
	s.SuggestMenu.Get("classList").Call("add", "invisible")
	s.IsShowSuggestMenu = false
}

func (s *SuggestMenuStateMachine) setSuggestMenuPosition() {
	rect := gojs.GetPosition(s.Input)
	s.SuggestMenu.Get("style").Set("left", rect.Left+"px")
	s.SuggestMenu.Get("style").Set("minWidth", rect.Width+"px")
}

func (s *SuggestMenuStateMachine) appendWords(words []string) {
	s.SuggestedWordsDivs = nil
	gojs.RemoveAllChildNodes(s.SuggestMenu)
	for _, word := range words {
		div := js.Global.Get("document").Call("createElement", "div")
		div.Set("textContent", word)
		s.SuggestedWordsDivs = append(s.SuggestedWordsDivs, div)
		s.SuggestMenu.Call("appendChild", div)
	}
	s.SuggestMenu.Get("classList").Call("remove", "invisible")
	s.IsShowSuggestMenu = true
}

func (s *SuggestMenuStateMachine) UpdateSuggestMenu(word string) {
	suggestedWords := s.FuncSugguestWords(word)
	if len(suggestedWords) == 0 {
		s.HideSuggestMenu()
	} else {
		s.setSuggestMenuPosition()
		s.appendWords(suggestedWords)
	}
}

func (s *SuggestMenuStateMachine) HandleArrowUp() {
	s.CurrentSelectedWordIndex -= 1

	if s.CurrentSelectedWordIndex == -2 {
		s.CurrentSelectedWordIndex = len(s.SuggestedWordsDivs) - 1
		s.SuggestedWordsDivs[s.CurrentSelectedWordIndex].Get("classList").Call("add", "wordSelected")
	} else if s.CurrentSelectedWordIndex == -1 {
		s.SuggestedWordsDivs[s.CurrentSelectedWordIndex+1].Get("classList").Call("remove", "wordSelected")
	} else {
		s.SuggestedWordsDivs[s.CurrentSelectedWordIndex].Get("classList").Call("add", "wordSelected")
		if s.CurrentSelectedWordIndex < len(s.SuggestedWordsDivs)-1 {
			s.SuggestedWordsDivs[s.CurrentSelectedWordIndex+1].Get("classList").Call("remove", "wordSelected")
		}
	}
}
