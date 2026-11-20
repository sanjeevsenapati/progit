import{r as d,j as e,P as D,k as I,S as L,l as P}from"./index-D3RXIKjJ.js";import{C as M}from"./ToolUI-AEOxrkSM.js";const j="progit_toolbox_snippets",F=[{id:"snip-1",title:"Go HTTP Server with Graceful Shutdown",language:"go",tags:["backend","http","server"],updatedAt:"2026-11-20",code:`package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})

	srv := &http.Server{
		Addr:         ":8080",
		Handler:      mux,
		ReadTimeout:  5 * time.Second,
		WriteTimeout: 10 * time.Second,
	}

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	<-stop
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	srv.Shutdown(ctx)
}`},{id:"snip-2",title:"Docker Multi-Stage Go Build",language:"docker",tags:["docker","container","go"],updatedAt:"2026-11-20",code:`# syntax=docker/dockerfile:1
FROM golang:1.24-alpine AS builder
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /bin/app ./cmd/app

FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata
USER 10001:10001
COPY --from=builder /bin/app /bin/app
EXPOSE 8080
ENTRYPOINT ["/bin/app"]`},{id:"snip-3",title:"TypeScript React Debounce Hook",language:"typescript",tags:["react","hook","frontend"],updatedAt:"2026-11-20",code:`import { useEffect, useState } from 'react';

export function useDebounce<T>(value: T, delayMs = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => clearTimeout(handler);
  }, [value, delayMs]);

  return debouncedValue;
}`}],B=()=>{const[o,p]=d.useState(()=>{try{const t=localStorage.getItem(j);if(t)return JSON.parse(t)}catch{}return F}),[c,g]=d.useState(()=>{var t;return((t=o[0])==null?void 0:t.id)||""}),[x,w]=d.useState(""),[u,G]=d.useState("all"),[b,n]=d.useState(!1),[l,m]=d.useState(""),[f,S]=d.useState("typescript"),[v,h]=d.useState(""),[k,y]=d.useState("");d.useEffect(()=>{try{localStorage.setItem(j,JSON.stringify(o))}catch{}},[o]);const a=d.useMemo(()=>o.find(t=>t.id===c)||o[0],[o,c]),N=d.useMemo(()=>o.filter(t=>{const r=u==="all"||t.language===u,s=x.toLowerCase(),i=!s||t.title.toLowerCase().includes(s)||t.tags.some(A=>A.toLowerCase().includes(s))||t.code.toLowerCase().includes(s);return r&&i}),[o,u,x]),C=()=>{n(!0),m("New Snippet"),S("typescript"),h("code, helper"),y(`// Write your reusable code here
`)},E=()=>{a&&(n(!0),m(a.title),S(a.language),h(a.tags.join(", ")),y(a.code))},T=()=>{if(!l.trim())return;const t=v.split(",").map(r=>r.trim()).filter(Boolean);if(b&&a&&l===a.title)p(r=>r.map(s=>s.id===a.id?{...s,title:l,language:f,tags:t,code:k,updatedAt:new Date().toISOString().split("T")[0]}:s));else{const r={id:`snip-${Date.now()}`,title:l,language:f,tags:t,code:k,updatedAt:new Date().toISOString().split("T")[0]};p(s=>[r,...s]),g(r.id)}n(!1)},O=t=>{var r;if(p(s=>s.filter(i=>i.id!==t)),c===t){const s=o.filter(i=>i.id!==t);g(((r=s[0])==null?void 0:r.id)||"")}},R=()=>{const t="data:text/json;charset=utf-8,"+encodeURIComponent(JSON.stringify(o,null,2)),r=document.createElement("a");r.setAttribute("href",t),r.setAttribute("download","progit-snippets-backup.json"),r.click()};return e.jsxs("div",{className:"space-y-4",children:[e.jsxs("div",{className:"flex flex-wrap items-center justify-between gap-3",children:[e.jsxs("div",{className:"flex items-center space-x-2 text-xs",children:[e.jsxs("button",{type:"button",onClick:C,className:"inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-500 cursor-pointer",children:[e.jsx(D,{className:"w-3.5 h-3.5"}),e.jsx("span",{children:"New Snippet"})]}),e.jsxs("button",{type:"button",onClick:R,className:"inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-700 dark:text-dark-text hover:bg-gray-50 text-xs",children:[e.jsx(I,{className:"w-3.5 h-3.5 text-sky-500"}),e.jsx("span",{children:"Export JSON"})]})]}),e.jsxs("div",{className:"relative w-64",children:[e.jsx(L,{className:"w-3.5 h-3.5 absolute left-2.5 top-2.5 text-gray-400"}),e.jsx("input",{type:"text",value:x,onChange:t=>w(t.target.value),placeholder:"Search snippets or tags...",className:"w-full text-xs pl-8 pr-3 py-1.5 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-800 dark:text-dark-text focus:outline-none focus:ring-1 focus:ring-emerald-500"})]})]}),e.jsxs("div",{className:"grid grid-cols-1 lg:grid-cols-12 gap-4",children:[e.jsxs("div",{className:"lg:col-span-4 space-y-2 max-h-[540px] overflow-y-auto pr-1",children:[N.map(t=>e.jsxs("div",{onClick:()=>{g(t.id),n(!1)},className:`p-3 rounded-xl border text-xs cursor-pointer transition-all ${c===t.id&&!b?"border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20":"border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg hover:border-gray-300"}`,children:[e.jsxs("div",{className:"flex items-center justify-between mb-1",children:[e.jsx("span",{className:"font-semibold text-gray-800 dark:text-dark-text truncate",children:t.title}),e.jsx("span",{className:"text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-gray-100 dark:bg-dark-border text-gray-600 dark:text-dark-muted",children:t.language})]}),e.jsx("div",{className:"flex flex-wrap gap-1 mt-1.5",children:t.tags.map(r=>e.jsxs("span",{className:"text-[10px] text-gray-500 dark:text-dark-muted bg-gray-100 dark:bg-dark-border/40 px-1.5 py-0.2 rounded",children:["#",r]},r))})]},t.id)),N.length===0&&e.jsx("p",{className:"text-xs text-gray-400 p-4 text-center",children:"No snippets found."})]}),e.jsx("div",{className:"lg:col-span-8",children:b?e.jsxs("div",{className:"p-4 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg space-y-3",children:[e.jsx("h3",{className:"text-xs font-bold text-gray-700 dark:text-dark-text uppercase tracking-wider",children:a?"Edit Snippet":"Create Snippet"}),e.jsxs("div",{className:"grid grid-cols-1 md:grid-cols-2 gap-2 text-xs",children:[e.jsx("input",{type:"text",value:l,onChange:t=>m(t.target.value),placeholder:"Snippet Title",className:"p-2 rounded-lg border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg font-semibold"}),e.jsx("input",{type:"text",value:v,onChange:t=>h(t.target.value),placeholder:"Tags (comma separated: go, api)",className:"p-2 rounded-lg border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg"})]}),e.jsx("textarea",{value:k,onChange:t=>y(t.target.value),rows:16,className:"w-full font-mono text-xs p-3 rounded-lg border border-gray-200 dark:border-dark-border bg-gray-900 text-emerald-400 focus:outline-none",placeholder:"Paste or write code snippet..."}),e.jsxs("div",{className:"flex items-center justify-end space-x-2 text-xs",children:[e.jsx("button",{type:"button",onClick:()=>n(!1),className:"px-3 py-1.5 rounded-lg border border-gray-200 dark:border-dark-border text-gray-600",children:"Cancel"}),e.jsx("button",{type:"button",onClick:T,className:"px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold",children:"Save Snippet"})]})]}):a?e.jsxs("div",{className:"p-4 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg space-y-3",children:[e.jsxs("div",{className:"flex items-start justify-between gap-3",children:[e.jsxs("div",{children:[e.jsx("h3",{className:"text-sm font-bold text-gray-800 dark:text-dark-text",children:a.title}),e.jsxs("div",{className:"flex items-center space-x-2 mt-1",children:[e.jsx("span",{className:"text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold",children:a.language}),e.jsxs("span",{className:"text-xs text-gray-400",children:["Updated ",a.updatedAt]})]})]}),e.jsxs("div",{className:"flex items-center space-x-2",children:[e.jsx("button",{type:"button",onClick:E,className:"px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-700 dark:text-dark-text hover:bg-gray-50",children:"Edit"}),e.jsx(M,{value:a.code,label:"Copy Snippet"}),e.jsx("button",{type:"button",onClick:()=>O(a.id),className:"p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30",title:"Delete Snippet",children:e.jsx(P,{className:"w-4 h-4"})})]})]}),e.jsx("pre",{className:"p-3.5 rounded-lg bg-gray-900 text-gray-100 font-mono text-xs overflow-x-auto leading-relaxed border border-gray-800",children:e.jsx("code",{children:a.code})})]}):null})]})]})};export{B as CodeSnippetTool,B as default};
