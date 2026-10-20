This is Gaston, version ${version}.

Gaston files your notes, organizes them, and makes them findable again. It runs
on your own machine, on your own files. Nothing is uploaded.


How to start it
---------------

Double-click ${exe}. There is nothing to install.

On the first start, Windows SmartScreen shows a blue window saying "Windows
protected your PC". That is expected: this app is not code-signed, and
SmartScreen says so for every unsigned program. It is not a virus warning.
Click "More info", then "Run anyway".


What a vault is
---------------

A vault is a folder of your own Markdown files that Gaston reads and organizes.
On the first start you either create a new vault folder or open one you already
have. Gaston does not bring a vault with it.


Where your data lives
---------------------

Your notes stay in your vault folder, wherever you put it - a local drive, a USB
stick, a synced folder, your choice. They stay plain Markdown files you can open
in any editor.

App settings and, if you add one, your API key live in your Windows user profile
(the app's "userData" folder), never inside the vault. Nothing leaves your
machine unless you configure a model provider yourself.


Working without an API key
--------------------------

The app is fully usable with no API key. Capture, search, projects, todos and
the journal all work without one. Every AI feature says plainly that it needs a
model instead of failing or breaking.


What an API key adds
--------------------

The AI features: asking questions about your notes, the journal chat, and
suggestions for where a captured thought should be filed. This is optional and
is configured later under Settings, once a vault is open.


Not covered
-----------

- No auto-update. A new version arrives as a new ZIP.
- Windows only. There is no macOS or Linux build.
- No built-in vault. You create or open your own on the first start.
