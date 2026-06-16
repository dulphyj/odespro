import re
import logging
from dataclasses import dataclass, asdict

logger = logging.getLogger(__name__)


@dataclass
class ClassificationResult:
    document_type: str
    confidence: float
    matches: dict
    matched_patterns: list

    def to_dict(self):
        return asdict(self)


class ClassificationRule:
    def __init__(self, doc_type: str, patterns: list, weight: float = 1.0):
        self.doc_type = doc_type
        self.patterns = patterns
        self.weight = weight

    def evaluate(self, text: str) -> dict:
        match_count = 0
        matched = []
        for pattern in self.patterns:
            if isinstance(pattern, tuple):
                pat, flags = pattern
            else:
                pat, flags = pattern, re.IGNORECASE
            found = re.findall(pat, text, flags)
            if found:
                match_count += len(found)
                matched.append(pat)
        return {"match_count": match_count, "matched_patterns": matched}

    def score(self, text_length: int, match_count: int) -> float:
        if text_length == 0:
            return 0.0
        raw = match_count / (text_length / 100.0)
        return min(raw * self.weight, 1.0)


class ClassificationEngine:
    def __init__(self):
        self.rules = self._build_rules()
        logger.info("ClassificationEngine initialized with %d rules", len(self.rules))

    @staticmethod
    def _build_rules() -> list:
        return [
            ClassificationRule(
                "CI",
                [
                    r"\d{6,11}\s*[-]?\s*[A-Z]",
                    r"c[eé]dula",
                    r"identidad",
                    r"C\.I\.",
                    r"carnet\s+de\s+identidad",
                ],
                weight=1.2,
            ),
            ClassificationRule(
                "NIT",
                [
                    r"\d{4,}[-]\d+",
                    r"\bnit\b",
                    r"identificaci[oó]n\s+tributaria",
                    r"registro\s+[uú]nico",
                    r"n[uú]mero\s+de\s+identificaci[oó]n\s+tributaria",
                ],
                weight=1.1,
            ),
            ClassificationRule(
                "CONTRATO",
                [
                    r"contrato",
                    r"cl[aá]usula",
                    r"\bpartes\b",
                    r"comparecen",
                    r"vigencia",
                    r"pr[oó]rroga",
                    r"obligaciones\s+de\s+las\s+partes",
                ],
                weight=1.0,
            ),
            ClassificationRule(
                "FACTURA",
                [
                    r"factura",
                    r"\btotal\b",
                    r"subtotal",
                    r"\biva\b",
                    r"\bRUC\b",
                    r"comprobante",
                    r"precio",
                    r"cantidad",
                    r"n[uú]mero\s+de\s+factura",
                    r"fecha\s+de\s+emisi[oó]n",
                ],
                weight=1.0,
            ),
            ClassificationRule(
                "SOLICITUD",
                [
                    r"solicitud",
                    r"solicito",
                    r"solicitante",
                    r"por\s+medio\s+de\s+la\s+presente",
                    r"expongo",
                    r"respetuosamente\s+solicito",
                ],
                weight=0.9,
            ),
            ClassificationRule(
                "FORMULARIO",
                [
                    r"formulario",
                    r"diligencie",
                    r"llene",
                    r"complete",
                    r"campo",
                    r"instrucciones",
                ],
                weight=0.9,
            ),
            ClassificationRule(
                "CARTA",
                [
                    r"\bcarta\b",
                    r"estimado",
                    r"atentamente",
                    r"saludos",
                    r"Sr\.",
                    r"Sra\.",
                    r"reciba\s+un\s+cordial\s+saludo",
                    r"le\s+escribo",
                ],
                weight=0.8,
            ),
            ClassificationRule(
                "MEMORANDUM",
                [
                    r"memor[aá]ndum",
                    r"memorandum",
                    r"ref:",
                    r"\basunto\b",
                    r"destinatario",
                    r"para\s+conocimiento",
                ],
                weight=0.9,
            ),
        ]

    def classify(self, text: str) -> ClassificationResult:
        if not text or not text.strip():
            return ClassificationResult(
                document_type="OTRO",
                confidence=0.0,
                matches={},
                matched_patterns=[],
            )
        text_lower = text.lower()
        text_length = len(text_lower)
        best_type = "OTRO"
        best_score = 0.0
        best_matches = {}
        best_matched = []
        for rule in self.rules:
            result = rule.evaluate(text_lower)
            match_count = result["match_count"]
            matched = result["matched_patterns"]
            if match_count == 0:
                continue
            score = rule.score(text_length, match_count)
            logger.debug(
                "Rule %s: match_count=%d, score=%.4f",
                rule.doc_type,
                match_count,
                score,
            )
            if score > best_score:
                best_score = score
                best_type = rule.doc_type
                best_matches[rule.doc_type] = match_count
                best_matched = matched
            elif score == best_score and match_count > best_matches.get(rule.doc_type, 0):
                best_type = rule.doc_type
                best_matched = matched
        if best_score < 0.05:
            best_type = "OTRO"
            best_confidence = 0.0
        else:
            best_confidence = min(best_score, 1.0)
        return ClassificationResult(
            document_type=best_type,
            confidence=round(best_confidence, 4),
            matches=best_matches,
            matched_patterns=best_matched,
        )
