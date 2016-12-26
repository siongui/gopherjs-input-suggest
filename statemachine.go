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
	OriginalWord             string
	SuggestedWords           []string
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

func (s *SuggestMenuStateMachine) SetWord(word string) {
	s.Input.Set("value", word)
}

func (s *SuggestMenuStateMachine) HideSuggestMenu() {
	s.SuggestMenu.Get("classList").Call("add", "invisible")
	s.IsShowSuggestMenu = false
}

func (s *SuggestMenuStateMachine) ShowSuggestMenu() {
	s.SuggestMenu.Get("classList").Call("remove", "invisible")
	s.IsShowSuggestMenu = true
}

func (s *SuggestMenuStateMachine) setSuggestMenuPosition() {
	rect := gojs.GetPosition(s.Input)
	s.SuggestMenu.Get("style").Set("left", rect.Left+"px")
	s.SuggestMenu.Get("style").Set("minWidth", rect.Width+"px")
}

func (s *SuggestMenuStateMachine) registerMouseenterEventToWordDiv(index int, word string, wordDiv *js.Object) {
	// mouse enters the suggested word in suggestion menu
	wordDiv.Call("addEventListener", "mouseenter", func(event *js.Object) {
		if s.CurrentSelectedWordIndex > -1 &&
			s.CurrentSelectedWordIndex < len(s.SuggestedWords) {
			s.UnhighlightSelectedWord(s.CurrentSelectedWordIndex)
		}

		s.CurrentSelectedWordIndex = index
		s.HighlightSelectedWord(s.CurrentSelectedWordIndex)
		s.SetWord(word)
	}, false)
}

func (s *SuggestMenuStateMachine) registerClickEventToWordDiv(wordDiv *js.Object) {
	// suggested word clicked by mouse
	wordDiv.Call("addEventListener", "click", func(event *js.Object) {
		s.SuggestedWords = nil
		s.HideSuggestMenu()
		s.Input.Call("focus")
	}, false)
}

func (s *SuggestMenuStateMachine) appendWords(words []string) {
	s.SuggestedWordsDivs = nil
	gojs.RemoveAllChildNodes(s.SuggestMenu)
	for index, word := range words {
		div := js.Global.Get("document").Call("createElement", "div")
		s.registerMouseenterEventToWordDiv(index, word, div)
		s.registerClickEventToWordDiv(div)
		div.Set("textContent", word)
		s.SuggestedWordsDivs = append(s.SuggestedWordsDivs, div)
		s.SuggestMenu.Call("appendChild", div)
	}
}

func (s *SuggestMenuStateMachine) HighlightSelectedWord(index int) {
	s.SuggestedWordsDivs[index].Get("classList").Call("add", "wordSelected")
}

func (s *SuggestMenuStateMachine) UnhighlightSelectedWord(index int) {
	s.SuggestedWordsDivs[index].Get("classList").Call("remove", "wordSelected")
}

func (s *SuggestMenuStateMachine) UpdateSuggestMenu(word string) {
	s.OriginalWord = word
	s.CurrentSelectedWordIndex = -1
	s.SuggestedWords = s.FuncSugguestWords(word)
	if len(s.SuggestedWords) == 0 {
		s.HideSuggestMenu()
	} else {
		s.setSuggestMenuPosition()
		s.appendWords(s.SuggestedWords)
		s.ShowSuggestMenu()
	}
}

func (s *SuggestMenuStateMachine) HandleArrowUp() {
	if !s.IsShowSuggestMenu {
		w := s.GetWord()
		if w != "" {
			// If suggestion menu is hidden and user input is not empty
			s.UpdateSuggestMenu(w)
		}
		return
	}

	s.CurrentSelectedWordIndex -= 1

	if s.CurrentSelectedWordIndex == -2 {
		s.CurrentSelectedWordIndex = len(s.SuggestedWordsDivs) - 1
		s.HighlightSelectedWord(s.CurrentSelectedWordIndex)
		s.SetWord(s.SuggestedWords[s.CurrentSelectedWordIndex])
	} else if s.CurrentSelectedWordIndex == -1 {
		s.UnhighlightSelectedWord(0)
		s.SetWord(s.OriginalWord)
	} else {
		s.HighlightSelectedWord(s.CurrentSelectedWordIndex)
		s.SetWord(s.SuggestedWords[s.CurrentSelectedWordIndex])
		if s.CurrentSelectedWordIndex < len(s.SuggestedWordsDivs)-1 {
			s.UnhighlightSelectedWord(s.CurrentSelectedWordIndex + 1)
		}
	}
}

func (s *SuggestMenuStateMachine) HandleArrowDown() {
	if !s.IsShowSuggestMenu {
		w := s.GetWord()
		if w != "" {
			// If suggestion menu is hidden and user input is not empty
			s.UpdateSuggestMenu(w)
		}
		return
	}

	s.CurrentSelectedWordIndex += 1

	if s.CurrentSelectedWordIndex == len(s.SuggestedWordsDivs) {
		s.UnhighlightSelectedWord(s.CurrentSelectedWordIndex - 1)
		s.CurrentSelectedWordIndex = -1
		s.SetWord(s.OriginalWord)
	} else {
		s.HighlightSelectedWord(s.CurrentSelectedWordIndex)
		s.SetWord(s.SuggestedWords[s.CurrentSelectedWordIndex])
		if s.CurrentSelectedWordIndex > 0 {
			s.UnhighlightSelectedWord(s.CurrentSelectedWordIndex - 1)
		}
	}
}

func (s *SuggestMenuStateMachine) HandleESC() {
	if !s.IsShowSuggestMenu {
		// clear user input if no suggestion menu and ESC key pressed
		s.SetWord("")
		s.SuggestedWords = nil
		return
	}
	s.SetWord(s.OriginalWord)
	s.SuggestedWords = nil
	s.HideSuggestMenu()
}
