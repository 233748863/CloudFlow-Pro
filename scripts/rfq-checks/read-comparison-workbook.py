import json
import posixpath
import sys
import xml.etree.ElementTree as ElementTree
import zipfile


def read_workbook(filename):
    namespace = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
    relation_namespace = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
    with zipfile.ZipFile(filename) as workbook:
        strings = []
        if "xl/sharedStrings.xml" in workbook.namelist():
            shared = ElementTree.fromstring(workbook.read("xl/sharedStrings.xml"))
            strings = ["".join(node.text or "" for node in entry.iter(namespace + "t")) for entry in shared]
        relationships = ElementTree.fromstring(workbook.read("xl/_rels/workbook.xml.rels"))
        targets = {entry.attrib["Id"]: entry.attrib["Target"] for entry in relationships
                   if entry.attrib.get("TargetMode") != "External"}
        definition = ElementTree.fromstring(workbook.read("xl/workbook.xml"))
        result = []
        for sheet in definition.find(namespace + "sheets"):
            target = targets[sheet.attrib[relation_namespace + "id"]]
            source = target.lstrip("/") if target.startswith("/") else posixpath.normpath(posixpath.join("xl", target))
            document = ElementTree.fromstring(workbook.read(source))
            rows = []
            for row in document.findall(".//" + namespace + "sheetData/" + namespace + "row"):
                values = []
                for cell in row.findall(namespace + "c"):
                    if cell.find(namespace + "f") is not None:
                        raise ValueError("Comparison export must contain stored business values without formulas")
                    letters = "".join(character for character in cell.attrib["r"] if character.isalpha())
                    position = 0
                    for character in letters:
                        position = position * 26 + ord(character.upper()) - ord("A") + 1
                    while len(values) < position:
                        values.append("")
                    content = cell.find(namespace + "v")
                    value = content.text or "" if content is not None else ""
                    if cell.attrib.get("t") == "s":
                        value = strings[int(value)]
                    elif cell.attrib.get("t") == "inlineStr":
                        value = "".join(node.text or "" for node in cell.iter(namespace + "t"))
                    values[position - 1] = value
                if any(value != "" for value in values):
                    rows.append(values)
            result.append({"name": sheet.attrib["name"], "rows": rows})
        return {"sheets": result, "storedValues": True}


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise ValueError("One downloaded comparison workbook is required")
    sys.stdout.reconfigure(encoding="utf-8")
    json.dump(read_workbook(sys.argv[1]), sys.stdout, ensure_ascii=False)
