package suggest

import (
	. "github.com/siongui/godom"
	"strconv"
	"strings"
)

type SuggestMenuStateMachine struct {
	Input                    *Object
	SuggestMenu              *Object
	FuncSugguestWords        func(string) []string
	CurrentSelectedWordIndex int
	IsShowSuggestMenu        bool
	SuggestedWordsDivs       []*Object
	OriginalWord             string
	SuggestedWords           []string
}

func NewSuggestMenuStateMachine(input, sm *Object, fnSugguestWords func(string) []string) *SuggestMenuStateMachine {
	return &SuggestMenuStateMachine{
		Input:                    input,
		SuggestMenu:              sm,
		FuncSugguestWords:        fnSugguestWords,
		CurrentSelectedWordIndex: -1,
		IsShowSuggestMenu:        false,
	}
}

func (s *SuggestMenuStateMachine) GetWord() string {
	return strings.TrimSpace(s.Input.Value())
}

func (s *SuggestMenuStateMachine) SetWord(word string) {
	s.Input.SetValue(word)
}

func (s *SuggestMenuStateMachine) HideSuggestMenu() {
	s.SuggestMenu.ClassList().Add("invisible")
	s.IsShowSuggestMenu = false
}

func (s *SuggestMenuStateMachine) ShowSuggestMenu() {
	s.SuggestMenu.ClassList().Remove("invisible")
	s.IsShowSuggestMenu = true
}

func (s *SuggestMenuStateMachine) setSuggestMenuPosition() {
	rect := s.Input.GetBoundingClientRect()
	s.SuggestMenu.Style().SetLeft(
		strconv.FormatFloat(rect.Left(), 'f', -1, 64) + "px")
	s.SuggestMenu.Style().SetMaxWidth(
		strconv.FormatFloat(rect.Width(), 'f', -1, 64) + "px")
}

func (s *SuggestMenuStateMachine) registerMouseenterEventToWordDiv(index int, word string, wordDiv *Object) {
	// mouse enters the suggested word in suggestion menu
	wordDiv.AddEventListener("mouseenter", func(event Event) {
		if s.CurrentSelectedWordIndex > -1 &&
			s.CurrentSelectedWordIndex < len(s.SuggestedWords) {
			s.UnhighlightSelectedWord(s.CurrentSelectedWordIndex)
		}

		s.CurrentSelectedWordIndex = index
		s.HighlightSelectedWord(s.CurrentSelectedWordIndex)
		s.SetWord(word)
	})
}

func (s *SuggestMenuStateMachine) registerClickEventToWordDiv(wordDiv *Object) {
	// suggested word clicked by mouse
	wordDiv.AddEventListener("click", func(event Event) {
		s.SuggestedWords = nil
		s.HideSuggestMenu()
		s.Input.Focus()
	})
}

func (s *SuggestMenuStateMachine) appendWords(words []string) {
	s.SuggestedWordsDivs = nil
	s.SuggestMenu.RemoveAllChildNodes()
	for index, word := range words {
		div := Document.CreateElement("div")
		s.registerMouseenterEventToWordDiv(index, word, div)
		s.registerClickEventToWordDiv(div)

		bold := Document.CreateElement("strong")
		bold.SetTextContent(s.OriginalWord)
		div.AppendChild(bold)
		suffix := Document.CreateTextNode(strings.TrimPrefix(word, s.OriginalWord))
		div.AppendChild(suffix)

		s.SuggestedWordsDivs = append(s.SuggestedWordsDivs, div)
		s.SuggestMenu.AppendChild(div)
	}
}

func (s *SuggestMenuStateMachine) HighlightSelectedWord(index int) {
	s.SuggestedWordsDivs[index].ClassList().Add("wordSelected")
}

func (s *SuggestMenuStateMachine) UnhighlightSelectedWord(index int) {
	s.SuggestedWordsDivs[index].ClassList().Remove("wordSelected")
}

func (s *SuggestMenuStateMachine) UpdateSuggestMenu(word string) {
	if s.OriginalWord == word {
		return
	}

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
