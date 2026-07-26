const fs = require('fs');
const path = 'D:/Reasonix/project/backend/src/main/java/com/example/backend/service/QuestionService.java';
let content = fs.readFileSync(path, 'utf8');

// Find the cleanJson method and replace with non-regex version
const idx = content.indexOf('private String cleanJson');
const endIdx = content.indexOf('}', idx + 100) + 1;

const replacement = 
`    private String cleanJson(String raw) {
        if (raw == null || raw.isBlank()) return "{}";
        String cleaned = raw.replace("```json", "").replace("```", "").trim();
        int start = cleaned.indexOf('{');
        int end = cleaned.lastIndexOf('}');
        if (start >= 0 && end > start) {
            return cleaned.substring(start, end + 1);
        }
        return cleaned;
    }`;

content = content.substring(0, idx) + replacement + content.substring(endIdx);
fs.writeFileSync(path, content, 'utf8');
console.log('Fixed successfully');
