#!/usr/bin/env python3
"""Anonymize identities in a saved WeBWorK HTML page.

Usage:
  python tools/anonymize-webwork-html.py input.html output.html
  type input.html | python tools/anonymize-webwork-html.py > output.html
"""

from __future__ import annotations

import argparse
import html
import re
import sys
from html.parser import HTMLParser


EMAIL_PATTERN = re.compile(
    r"\b[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+\b"
)
ENCODED_EMAIL_PATTERN = re.compile(
    r"(?i)\b[A-Za-z0-9._%+-]+%40[A-Za-z0-9.-]+(?:%2e[A-Za-z0-9-]+)+\b"
)
NAME_PATTERN = re.compile(r"\b[A-Z][a-z]+(?:[-'][A-Z][a-z]+)?(?:\s+[A-Z][a-z]+){1,3}\b")
OPTION_NAME_PATTERN = re.compile(
    r"^\s*(?P<last>[A-Z][A-Za-z' -]+),\s*(?P<first>[A-Z][A-Za-z' -]+)\s*$"
)
IDENTITY_QUERY_PATTERN = re.compile(
    r"(?i)([?&](?:effectiveUser|user|username|student)(?:=))([^&#\"]+)"
)


class IdentityMap:
    def __init__(self) -> None:
        self._values: dict[str, str] = {}
        self._next_number = 1

    def replacement(self, value: str, category: str) -> str:
        key = f"{category}:{value.strip().casefold()}"
        if key not in self._values:
            self._values[key] = f"Person {self._next_number:03d}"
            self._next_number += 1
        return self._values[key]

    def email_replacement(self, value: str) -> str:
        key = f"email:{value.strip().casefold()}"
        if key not in self._values:
            self._values[key] = f"person{self._next_number:03d}@example.invalid"
            self._next_number += 1
        return self._values[key]


class WebWorkAnonymizer(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=False)
        self.identities = IdentityMap()
        self.output: list[str] = []
        self.option_depth = 0
        self.skip_text_depth = 0

    def anonymize_identity_text(self, value: str, *, option_text: bool = False) -> str:
        def replace_encoded_email(match: re.Match[str]) -> str:
            replacement = self.identities.email_replacement(match.group(0))
            return replacement.replace("@", "%40").replace(".", "%2E")

        def replace_email(match: re.Match[str]) -> str:
            return self.identities.email_replacement(match.group(0))

        result = ENCODED_EMAIL_PATTERN.sub(replace_encoded_email, value)
        result = EMAIL_PATTERN.sub(replace_email, result)

        def replace_query_identity(match: re.Match[str]) -> str:
            prefix = match.group(1)
            raw_value = match.group(2)
            if "%40" in raw_value.lower():
                replacement = self.identities.email_replacement(raw_value)
                replacement = replacement.replace("@", "%40").replace(".", "%2E")
            else:
                replacement = self.identities.replacement(raw_value, "username")
            return f"{prefix}{replacement}"

        result = IDENTITY_QUERY_PATTERN.sub(replace_query_identity, result)

        if option_text:
            option_match = OPTION_NAME_PATTERN.match(result)
            if option_match:
                return self.identities.replacement(result, "name")

        def replace_logged_in_name(match: re.Match[str]) -> str:
            return f"{match.group(1)}{self.identities.replacement(match.group(2), 'name')}"

        return re.sub(
            r"(?i)(\bLogged in as\s+)([A-Z][A-Za-z' -]+?)(?=[.!?]|$)",
            replace_logged_in_name,
            result,
        )

    def anonymize_attribute(self, value: str) -> str:
        return self.anonymize_identity_text(value)

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.output.append("<" + tag)
        for name, value in attrs:
            self.output.append(f" {name}")
            if value is not None:
                self.output.append(f'="{html.escape(self.anonymize_attribute(value), quote=True)}"')
        self.output.append(">")
        if tag.lower() == "option":
            self.option_depth += 1
        if tag.lower() in {"script", "style"}:
            self.skip_text_depth += 1

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.handle_starttag(tag, attrs)
        if self.output[-1] == ">":
            self.output[-1] = "/>"
        else:
            self.output.append("/")

    def handle_endtag(self, tag: str) -> None:
        self.output.append(f"</{tag}>")
        if tag.lower() == "option":
            self.option_depth = max(0, self.option_depth - 1)
        if tag.lower() in {"script", "style"}:
            self.skip_text_depth = max(0, self.skip_text_depth - 1)

    def handle_data(self, data: str) -> None:
        if self.skip_text_depth:
            self.output.append(data)
            return
        self.output.append(
            self.anonymize_identity_text(data, option_text=self.option_depth > 0)
        )

    def handle_entityref(self, name: str) -> None:
        self.output.append(f"&{name};")

    def handle_charref(self, name: str) -> None:
        self.output.append(f"&#{name};")

    def handle_comment(self, data: str) -> None:
        self.output.append(f"<!--{data}-->")

    def handle_decl(self, decl: str) -> None:
        self.output.append(f"<!{decl}>")

    def handle_pi(self, data: str) -> None:
        self.output.append(f"<?{data}>")


def anonymize(source: str) -> str:
    parser = WebWorkAnonymizer()
    parser.feed(source)
    parser.close()
    return "".join(parser.output)


def main() -> int:
    argument_parser = argparse.ArgumentParser(description=__doc__)
    argument_parser.add_argument("input", nargs="?", help="Input HTML file; defaults to stdin")
    argument_parser.add_argument("output", nargs="?", help="Output HTML file; defaults to stdout")
    args = argument_parser.parse_args()

    if args.input:
        with open(args.input, encoding="utf-8") as input_file:
            source = input_file.read()
    else:
        source = sys.stdin.read()

    result = anonymize(source)
    if args.output:
        with open(args.output, "w", encoding="utf-8", newline="") as output_file:
            output_file.write(result)
    else:
        sys.stdout.write(result)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
