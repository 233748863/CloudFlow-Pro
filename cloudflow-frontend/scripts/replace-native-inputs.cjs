/**
 * 批量替换原生 <input 为 UI 组件 <Input
 * 排除：type="radio"、type="checkbox"、type="file"、type="hidden"
 * 同时移除冗余的样式类（Input 组件自带 border、rounded、focus 等样式）
 */
const fs = require('fs');
const path = require('path');

// 需要处理的文件列表（从搜索结果中提取）
const files = [
  'src/components/WorkflowBuilder.tsx',
  'src/components/OrgStructure.tsx',
  'src/components/FormBuilder.tsx',
  'src/pages/OvertimePage.tsx',
  'src/pages/MeetingRoomPage.tsx',
  'src/pages/DutySchedulePage.tsx',
  'src/pages/BusinessTripPage.tsx',
  'src/pages/VisitorPage.tsx',
  'src/pages/AttendanceAppealPage.tsx',
  'src/pages/system/ConfigList.tsx',
  'src/pages/system/PostList.tsx',
];

// Input 组件自带的样式（替换时需要移除的冗余类）
const redundantClasses = [
  'border', 'border-slate-200', 'border-slate-300', 'border-gray-300',
  'rounded-lg', 'rounded-md', 'rounded',
  'p-2', 'p-2.5', 'px-3', 'py-2',
  'text-sm',
  'bg-white',
  'focus:ring-2', 'focus:ring-pink-400', 'focus:outline-none', 'outline-none',
  'focus:outline-none',
  'transition-all', 'transition-colors',
];

// 清理冗余样式类
function cleanClassName(classStr) {
  let classes = classStr.split(/\s+/).filter(Boolean);
  // 移除 Input 组件自带的样式
  classes = classes.filter(c => !redundantClasses.includes(c));
  return classes.join(' ');
}

let totalReplacements = 0;
let filesUpdated = 0;

for (const relPath of files) {
  const filePath = path.join(__dirname, '..', relPath);
  if (!fs.existsSync(filePath)) {
    console.log(`跳过不存在的文件: ${relPath}`);
    continue;
  }

  let content = fs.readFileSync(filePath, 'utf-8');
  const original = content;
  let fileReplacements = 0;

  // 匹配原生 <input 标签（排除 radio、checkbox、file、hidden）
  // 使用正则逐个匹配并替换
  const inputRegex = /<input\s+([^>]*?)\/?\s*>/g;
  
  content = content.replace(inputRegex, (match, attrs) => {
    // 检查是否是需要排除的类型
    const typeMatch = attrs.match(/type="([^"]+)"/);
    const type = typeMatch ? typeMatch[1] : 'text';
    
    if (['radio', 'checkbox', 'file', 'hidden'].includes(type)) {
      return match; // 不替换这些类型
    }

    // 提取 className
    const classMatch = attrs.match(/className="([^"]+)"/);
    if (!classMatch) {
      // 没有 className 的 input，直接替换标签名
      fileReplacements++;
      return match.replace('<input', '<Input');
    }

    const originalClass = classMatch[1];
    const cleanedClass = cleanClassName(originalClass);

    // 替换标签名和清理后的 className
    let newMatch = match.replace('<input', '<Input');
    if (cleanedClass.trim()) {
      newMatch = newMatch.replace(`className="${originalClass}"`, `className="${cleanedClass}"`);
    } else {
      // 如果清理后没有剩余类，移除 className 属性
      newMatch = newMatch.replace(/\s*className="[^"]*"/, '');
    }

    fileReplacements++;
    return newMatch;
  });

  // 检查是否需要添加 Input 导入
  if (fileReplacements > 0 && content !== original) {
    // 检查是否已经导入了 Input
    const hasInputImport = /import\s+.*\{[^}]*Input[^}]*\}.*from\s+['"]@\/components\/ui\/input['"]/.test(content) ||
                           /import\s+\{\s*Input\s*\}.*from\s+['"]@\/components\/ui\/input['"]/.test(content) ||
                           /import\s+.*Input.*from\s+['"]\.\.\/.*ui\/input['"]/.test(content) ||
                           /import\s+.*Input.*from\s+['"]\.\/.*ui\/input['"]/.test(content);

    if (!hasInputImport) {
      // 在最后一个 import 语句后添加 Input 导入
      const lastImportIndex = content.lastIndexOf('\nimport ');
      if (lastImportIndex !== -1) {
        const endOfImport = content.indexOf('\n', lastImportIndex + 1);
        const nextLineEnd = content.indexOf('\n', endOfImport + 1);
        // 找到最后一个 import 语句的结尾
        let insertPos = endOfImport;
        // 继续查找，确保找到真正的最后一个 import
        let searchPos = endOfImport + 1;
        while (true) {
          const nextImport = content.indexOf('import ', searchPos);
          if (nextImport === -1 || nextImport > searchPos + 200) break;
          // 检查这个 import 是否在行首
          const lineStart = content.lastIndexOf('\n', nextImport);
          if (lineStart === -1 || content.substring(lineStart + 1, nextImport).trim() === '') {
            insertPos = content.indexOf('\n', nextImport);
            if (insertPos === -1) insertPos = content.length;
            searchPos = insertPos + 1;
          } else {
            break;
          }
        }
        
        // 确定导入路径
        let importPath = '@/components/ui/input';
        if (relPath.includes('components/')) {
          // 组件文件使用相对路径
          const depth = relPath.split('/').length - 2; // 减去 src/ 和文件名
          if (relPath.startsWith('src/components/')) {
            importPath = './ui/input';
          }
        }
        
        content = content.substring(0, insertPos) + 
                  `\nimport { Input } from '${importPath}';` + 
                  content.substring(insertPos);
      }
    }

    fs.writeFileSync(filePath, content, 'utf-8');
    totalReplacements += fileReplacements;
    filesUpdated++;
    console.log(`✅ ${relPath}: ${fileReplacements} 处替换`);
  } else {
    console.log(`⏭️ ${relPath}: 无需替换`);
  }
}

console.log(`\n总计: ${filesUpdated} 个文件, ${totalReplacements} 处替换`);
