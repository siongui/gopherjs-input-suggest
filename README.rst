============================
GopherJS_ Input Suggest Menu
============================

.. image:: https://img.shields.io/badge/Language-Go-blue.svg
   :target: https://golang.org/

.. image:: https://godoc.org/github.com/siongui/gopherjs-input-suggest?status.svg
   :target: https://godoc.org/github.com/siongui/gopherjs-input-suggest

.. image:: https://travis-ci.org/siongui/gopherjs-input-suggest.svg?branch=master
    :target: https://travis-ci.org/siongui/gopherjs-input-suggest

.. image:: https://gitlab.com/siongui/pali-dictionary/badges/master/pipeline.svg
    :target: https://gitlab.com/siongui/pali-dictionary/-/commits/master

.. image:: https://goreportcard.com/badge/github.com/siongui/gopherjs-input-suggest
   :target: https://goreportcard.com/report/github.com/siongui/gopherjs-input-suggest

.. image:: https://img.shields.io/badge/license-Unlicense-blue.svg
   :target: https://github.com/siongui/gopherjs-input-suggest/blob/master/UNLICENSE


Development Environment:

  - `Ubuntu 20.04`_
  - `Go 1.12.17`_
  - GopherJS_


Install
+++++++

Install GopherJS_ and this package:

.. code-block:: bash

  $ go get -u github.com/gopherjs/gopherjs
  $ go get -u github.com/siongui/gopherjs-input-suggest


Example
+++++++

See demos first. The following is key point in the code.

- Demo_ (no CSS framework)
- Demo-Bulma_ (with Bulma 0.9.0)

HTML_:

.. code-block:: html

  <div style="position: relative;">
    <input id="word" type="text" autofocus="autofocus" tabindex="1">
  </div>

The parent of input element is set to *position: relative;*. Also do not use
*text-align: center;* in parent/ancestor element of input element.

Go_:

.. code-block:: go

  BindSuggest("word", func(w string) []string {
  	// suggestion function implemented by you
  	return frozenTrie.GetSuggestedWords(w, 30)
  })

See `example <example>`_ directory for complete example.


Control Suggest Menu Behavior by Outside Widget
+++++++++++++++++++++++++++++++++++++++++++++++

Two methods *UpdateSuggestion* and *HideSuggestion* are exported so that outside
widget such as virtual Pali keypad can control the behavior of the suggest menu.
The reason why Pali keypad need this is that when users click the button on the
Pali keypad, no keyboard events are fired so that suggest menu will not be
updated or hidden automatically. As a result, Pali keypad has to update or hide
the suggest menu manually by these two methods.


UNLICENSE
+++++++++

Released in public domain. See UNLICENSE_.


References
++++++++++

.. [1] `GopherJS - A compiler from Go to JavaScript <http://www.gopherjs.org/>`_
       (`GitHub <https://github.com/gopherjs/gopherjs>`__,
       `GopherJS Playground <http://www.gopherjs.org/playground/>`_,
       |godoc|)

.. [2] `Element.classList - Web APIs | MDN <https://developer.mozilla.org/en/docs/Web/API/Element/classList>`_

.. [3] `javascript set left position <https://www.google.com/search?q=javascript+set+left+position>`_

       `HTML DOM Style left Property - W3Schools <http://www.w3schools.com/jsref/prop_style_left.asp>`_

.. [4] `javascript min width <https://www.google.com/search?q=javascript+min+width>`_

       `HTML DOM Style minWidth Property - W3Schools <http://www.w3schools.com/jsref/prop_style_minwidth.asp>`_

.. [5] `GitHub - siongui/godom: Make DOM manipultation in Go as similar to JavaScript as possible. (via GopherJS) <https://github.com/siongui/godom>`_

.. [6] | `bulma input suggest dropdown - Google search <https://www.google.com/search?q=bulma+input+suggest+dropdown>`_
       | `Autocomplete | Buefy <https://buefy.org/documentation/autocomplete/>`_


.. _Ubuntu 20.04: https://releases.ubuntu.com/20.04/
.. _Go 1.12.17: https://golang.org/dl/
.. _HTML: https://www.google.com/search?q=HTML
.. _Go: https://golang.org/
.. _GopherJS: https://github.com/gopherjs/gopherjs
.. _Demo: https://siongui.github.io/gopherjs-input-suggest/
.. _Demo-Bulma: https://siongui.github.io/gopherjs-input-suggest/index-bulma.html
.. _UNLICENSE: https://unlicense.org/

.. |godoc| image:: https://godoc.org/github.com/gopherjs/gopherjs/js?status.png
   :target: https://godoc.org/github.com/gopherjs/gopherjs/js
