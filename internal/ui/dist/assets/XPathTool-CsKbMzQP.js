import{r as m,j as e,n as T,T as E,f}from"./index-CtX_q3Ci.js";import{C as k,T as v}from"./ToolUI-CohnN2HP.js";function j(s,c){var n,o;const a=c.trim();if(!s.trim()||!a)return{matches:[],count:0,resultType:"EMPTY"};try{const i=new DOMParser().parseFromString(s,"application/xml"),h=i.querySelector("parsererror");if(h)return{matches:[],count:0,resultType:"ERROR",error:`XML Parsing Error: ${((n=h.textContent)==null?void 0:n.trim())||"Invalid XML syntax"}`};const g=t=>t&&i.lookupNamespaceURI(t)||null,l=i.evaluate(a,i,g,XPathResult.ANY_TYPE,null),r=[];switch(l.resultType){case XPathResult.NUMBER_TYPE:return{matches:[{nodeName:"number",nodeType:"NUMBER",value:String(l.numberValue),xml:String(l.numberValue),path:a}],count:1,resultType:"NUMBER"};case XPathResult.STRING_TYPE:return{matches:[{nodeName:"string",nodeType:"STRING",value:l.stringValue,xml:l.stringValue,path:a}],count:1,resultType:"STRING"};case XPathResult.BOOLEAN_TYPE:return{matches:[{nodeName:"boolean",nodeType:"BOOLEAN",value:String(l.booleanValue),xml:String(l.booleanValue),path:a}],count:1,resultType:"BOOLEAN"};case XPathResult.UNORDERED_NODE_ITERATOR_TYPE:case XPathResult.ORDERED_NODE_ITERATOR_TYPE:{let t=l.iterateNext();const N=new XMLSerializer;for(;t;){let x="ELEMENT",b=((o=t.textContent)==null?void 0:o.trim())||"",u="";t.nodeType===Node.ELEMENT_NODE?(x="ELEMENT",u=N.serializeToString(t)):t.nodeType===Node.ATTRIBUTE_NODE?(x="ATTRIBUTE",b=t.value,u=`${t.name}="${t.value}"`):t.nodeType===Node.TEXT_NODE?(x="TEXT",u=t.textContent||""):(x=`NODE_${t.nodeType}`,u=N.serializeToString(t)),r.push({nodeName:t.nodeName,nodeType:x,value:b,xml:u,path:y(t)}),t=l.iterateNext()}return{matches:r,count:r.length,resultType:"NODE_SET"}}default:return{matches:[],count:0,resultType:"UNKNOWN"}}}catch(p){return{matches:[],count:0,resultType:"ERROR",error:p.message||"Invalid XPath expression syntax"}}}function y(s){if(s.nodeType===Node.ATTRIBUTE_NODE){const n=s.ownerElement;return n?`${y(n)}/@${s.name}`:`@${s.name}`}if(s.nodeType!==Node.ELEMENT_NODE)return s.parentNode?y(s.parentNode):"";const c=[];let a=s;for(;a&&a.nodeType===Node.ELEMENT_NODE;){let n=1,o=a.previousSibling;for(;o;)o.nodeType===Node.ELEMENT_NODE&&o.nodeName===a.nodeName&&n++,o=o.previousSibling;c.unshift(`${a.nodeName}[${n}]`),a=a.parentNode}return"/"+c.join("/")}const d={books:{label:"Book Inventory XML",path:"//book[price < 10]/title",xml:`<?xml version="1.0" encoding="UTF-8"?>
<bookstore>
  <book category="cooking">
    <title lang="en">Everyday Italian</title>
    <author>Giada De Laurentiis</author>
    <year>2005</year>
    <price>30.00</price>
  </book>
  <book category="children">
    <title lang="en">Harry Potter</title>
    <author>J. K. Rowling</author>
    <year>2005</year>
    <price>29.99</price>
  </book>
  <book category="web">
    <title lang="en">Learning XML</title>
    <author>Erik T. Ray</author>
    <year>2003</year>
    <price>9.95</price>
  </book>
</bookstore>`},pom:{label:"Maven pom.xml",path:'//dependency[groupId="org.springframework.boot"]/artifactId',xml:`<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <groupId>io.progit</groupId>
  <artifactId>progit-core</artifactId>
  <version>2.0.0-LTS</version>
  <dependencies>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-web</artifactId>
      <version>3.2.0</version>
    </dependency>
    <dependency>
      <groupId>org.postgresql</groupId>
      <artifactId>postgresql</artifactId>
      <version>42.7.1</version>
    </dependency>
  </dependencies>
</project>`}},I=()=>{const[s,c]=m.useState("books"),[a,n]=m.useState(d.books.xml),[o,p]=m.useState(d.books.path),{matches:i,count:h,error:g}=m.useMemo(()=>j(a,o),[a,o]),l=m.useMemo(()=>i.length===0?"":i.map((r,t)=>`[${t+1}] (${r.nodeType}) ${r.path}
${r.xml}`).join(`

`),[i]);return e.jsxs("div",{className:"space-y-4",children:[e.jsxs("div",{className:"flex flex-wrap items-center justify-between gap-3",children:[e.jsxs("div",{className:"flex items-center space-x-2 text-xs",children:[e.jsx("span",{className:"font-semibold text-gray-500",children:"Preset:"}),e.jsx("div",{className:"w-56",children:e.jsx(T,{value:s,onChange:r=>{c(r),d[r]&&(n(d[r].xml),p(d[r].path))},options:Object.entries(d).map(([r,t])=>({value:r,label:t.label}))})})]}),e.jsx("div",{className:"flex items-center space-x-2",children:e.jsx(k,{value:l,label:"Copy Matches"})})]}),e.jsxs("div",{className:"p-3 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg space-y-1.5",children:[e.jsxs("label",{className:"text-xs font-bold text-gray-700 dark:text-dark-text flex items-center justify-between",children:[e.jsxs("span",{className:"flex items-center space-x-1.5",children:[e.jsx(E,{className:"w-3.5 h-3.5 text-sky-500"}),e.jsx("span",{children:"XPath 1.0 Expression"})]}),e.jsx("span",{className:"text-[11px] font-normal text-gray-400",children:"Supports //tag, //tag[@attr='val'], text(), count(), etc."})]}),e.jsx("input",{type:"text",value:o,onChange:r=>p(r.target.value),placeholder:"//book[price<10]/title",className:"w-full font-mono text-xs p-2 rounded-lg border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg text-sky-600 dark:text-sky-400 font-bold focus:outline-none focus:ring-2 focus:ring-sky-500"})]}),e.jsxs("div",{className:"grid grid-cols-1 lg:grid-cols-2 gap-4",children:[e.jsxs("div",{className:"space-y-1.5",children:[e.jsxs("div",{className:"flex items-center justify-between text-xs text-gray-500 px-1",children:[e.jsx("span",{className:"font-semibold uppercase tracking-wider",children:"Input XML Document"}),e.jsxs("span",{children:[new Blob([a]).size," bytes"]})]}),e.jsx("textarea",{value:a,onChange:r=>n(r.target.value),rows:16,className:"w-full font-mono text-xs p-3 rounded-xl border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg text-gray-800 dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-sky-500 resize-y"})]}),e.jsxs("div",{className:"space-y-1.5",children:[e.jsxs("div",{className:"flex items-center justify-between text-xs text-gray-500 px-1",children:[e.jsxs("span",{className:"font-semibold uppercase tracking-wider flex items-center space-x-1.5",children:[e.jsx(f,{className:"w-3.5 h-3.5 text-amber-500"}),e.jsx("span",{children:"Matched XML Nodes"})]}),e.jsxs("span",{className:"font-mono text-sky-600 dark:text-sky-400 font-bold",children:[h," match(es)"]})]}),e.jsxs("div",{className:"space-y-2",children:[g&&e.jsx(v,{error:g}),e.jsx("div",{className:"p-3.5 rounded-xl border border-gray-200 dark:border-dark-border bg-gray-900 min-h-[340px] max-h-[460px] overflow-auto",children:i.length===0?e.jsx("p",{className:"text-xs text-gray-500 font-mono",children:"No nodes matching XPath expression."}):e.jsx("div",{className:"space-y-3 font-mono text-xs text-gray-200",children:i.map((r,t)=>e.jsxs("div",{className:"p-2.5 rounded bg-gray-800/80 border border-gray-700/60 space-y-1",children:[e.jsxs("div",{className:"flex items-center justify-between text-[11px] text-sky-400",children:[e.jsxs("span",{className:"font-bold",children:["Match #",t+1," (",r.nodeType,")"]}),e.jsx("span",{className:"text-gray-400",children:r.path})]}),e.jsx("pre",{className:"text-emerald-300 overflow-x-auto text-[11px] whitespace-pre-wrap",children:r.xml})]},t))})})]})]})]})]})};export{I as XPathTool,I as default};
