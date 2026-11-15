"""Offline, publication-safe Scrutari pronunciation guide checks (stdlib only)."""
from html.parser import HTMLParser
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[2]
GUIDE = ROOT / "docs" / "pronunciation" / "index.html"
MEDIA_README = ROOT / "docs" / "pronunciation" / "README.md"
TOP_README = ROOT / "README.md"


class LinksAndControls(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.links = []
        self.forbidden = []
        self.has_english = False
        self.has_heading = False
        self.has_aria = False
        self.has_style = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "html" and attrs.get("lang") == "en":
            self.has_english = True
        if tag == "h1":
            self.has_heading = True
        if tag == "style":
            self.has_style = True
        if "aria-label" in attrs or "aria-labelledby" in attrs:
            self.has_aria = True
        if tag in {"script", "iframe", "form", "audio", "video", "source"}:
            self.forbidden.append(tag)
        for key in ("src", "href", "action"):
            if key in attrs:
                self.links.append(attrs[key])


class OfflineGuide(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html = GUIDE.read_text(encoding="utf-8")
        cls.docs = MEDIA_README.read_text(encoding="utf-8")
        cls.readme = TOP_README.read_text(encoding="utf-8")
        cls.parser = LinksAndControls()
        cls.parser.feed(cls.html)

    def test_text_and_ipa_are_consistent(self):
        for field in ("skroo-TAH-ree", "/skruːˈtɑː.riː/"):
            self.assertIn(field, self.html)
            self.assertIn(field, self.docs)
            self.assertIn(field, self.readme)
        for syllable in ("skroo", "TAH", "ree"):
            self.assertIn(f"<strong>{syllable}</strong>", self.html)
        self.assertIn("stressed", self.html)

    def test_accessibility_and_fallback(self):
        self.assertTrue(self.parser.has_english)
        self.assertTrue(self.parser.has_heading)
        self.assertTrue(self.parser.has_aria)
        self.assertTrue(self.parser.has_style)
        self.assertIn("prefers-reduced-motion", self.html)
        self.assertIn("pending owner", self.html.lower())

    def test_no_unapproved_playback_or_remote_dependencies(self):
        self.assertEqual(self.parser.forbidden, [])
        self.assertNotIn("@import", self.html)
        self.assertNotIn("fetch(", self.html)
        for link in self.parser.links:
            self.assertFalse(re.match(r"(?i)^(?:[a-z][a-z0-9+.-]*:|//)", link), link)
            self.assertTrue((GUIDE.parent / link).is_file(), link)
        self.assertIn("not yet produced or approved", self.docs)

    def test_readme_routes_to_guide(self):
        self.assertIn("docs/pronunciation/index.html", self.readme)
        self.assertIn("docs/pronunciation/README.md", self.readme)
        self.assertIn("source", self.docs.lower())
        self.assertIn("human", self.docs.lower())


if __name__ == "__main__":
    unittest.main()
