package suggest

var css = `
.suggest {
  border-top-color: #C9D7F1;
  border-right-color: #36C;
  border-bottom-color: #36C;
  border-left-color: #A2BAE7;
  border-style: solid;
  border-width: 1px;
  z-index: 10;
  padding: 0;
  background-color: white;
  overflow: hidden;
  // - it seems that it does not matter relative position is set or not.
  // seems no need to set position if there is no word preview.
  // - if absolute is set, the width of suggest menu will be "narrow". just fit
  // the width of longest words
  // - set position to absolute if there is word preview next to suggest menu
  position: relative;
  left: 0;
  text-align: left;
  font-size: large;
  border-radius: 4px;
  margin-top: 1px;
  line-height: 1.25em;
}
.wordSelected {
  background: #00C;
  color: white;
  cursor: pointer;
}
.invisible-used-in-suggest {
  display: none;
}`
