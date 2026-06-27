const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');

function walkDir(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) { 
            results = results.concat(walkDir(file));
        } else { 
            if (file.endsWith('.tsx') || file.endsWith('.ts')) {
                results.push(file);
            }
        }
    });
    return results;
}

const files = walkDir(srcDir);

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    let changed = false;

    if (content.includes("'http://localhost:3001")) {
        content = content.replace(/'http:\/\/localhost:3001/g, '`${API_URL}');
        
        // Ensure API_URL is imported
        if (!content.includes('import { API_URL }')) {
            // Find the relative path to config.ts
            let rel = path.relative(path.dirname(file), path.join(srcDir, 'config.ts')).replace(/\\/g, '/');
            if (!rel.startsWith('.')) rel = './' + rel;
            if (rel.endsWith('.ts')) rel = rel.slice(0, -3); // remove .ts
            
            content = `import { API_URL } from '${rel}';\n` + content;
        }
        changed = true;
    }
    
    if (content.includes("`http://localhost:3001${")) {
        content = content.replace(/`http:\/\/localhost:3001\$\{/g, '`${API_URL}${');
        
        if (!content.includes('import { API_URL }')) {
            let rel = path.relative(path.dirname(file), path.join(srcDir, 'config.ts')).replace(/\\/g, '/');
            if (!rel.startsWith('.')) rel = './' + rel;
            if (rel.endsWith('.ts')) rel = rel.slice(0, -3); // remove .ts
            content = `import { API_URL } from '${rel}';\n` + content;
        }
        changed = true;
    }

    if (changed) {
        fs.writeFileSync(file, content);
        console.log("Updated", file);
    }
});
