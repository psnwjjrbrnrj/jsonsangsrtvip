#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
CapCut & JianYing draft_content.json to SRT / VTT / TXT Subtitle Converter
Chuyển đổi phụ đề từ CapCut / JianYing sang file SRT nhanh chóng, chính xác.
"""

import os
import sys
import json
import re
import argparse
from typing import List, Dict, Any, Optional

# Cấu hình UTF-8 cho console Windows
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

def clean_text_content(raw_content: Any) -> str:
    """Xử lý và làm sạch nội dung phụ đề từ các kiểu định dạng của CapCut/JianYing."""
    if not raw_content:
        return ""
    
    # Nếu là chuỗi JSON được bọc (VD: {"styles":[], "text": "..."})
    if isinstance(raw_content, str):
        content_str = raw_content.strip()
        if content_str.startswith("{") and content_str.endswith("}"):
            try:
                parsed = json.loads(content_str)
                if isinstance(parsed, dict) and "text" in parsed:
                    return clean_text_content(parsed["text"])
            except Exception:
                pass
        
        # Loại bỏ các thẻ định dạng kiểu HTML/XML (như <font>, <color>, <size>, v.v.)
        content_str = re.sub(r"<[^>]+>", "", content_str)
        # Loại bỏ các ký tự điều khiển xuống dòng dư thừa nếu cần
        return content_str.strip()
    
    if isinstance(raw_content, dict):
        if "text" in raw_content:
            return clean_text_content(raw_content["text"])
        if "content" in raw_content:
            return clean_text_content(raw_content["content"])
            
    return str(raw_content).strip()

def format_timestamp_srt(ms: int) -> str:
    """Chuyển milliseconds sang định dạng SRT: HH:MM:SS,mmm"""
    if ms < 0:
        ms = 0
    total_seconds = ms // 1000
    milliseconds = ms % 1000
    seconds = total_seconds % 60
    total_minutes = total_seconds // 60
    minutes = total_minutes % 60
    hours = total_minutes // 60
    return f"{hours:02d}:{minutes:02d}:{seconds:02d},{milliseconds:03d}"

def format_timestamp_vtt(ms: int) -> str:
    """Chuyển milliseconds sang định dạng WebVTT: HH:MM:SS.mmm"""
    if ms < 0:
        ms = 0
    total_seconds = ms // 1000
    milliseconds = ms % 1000
    seconds = total_seconds % 60
    total_minutes = total_seconds // 60
    minutes = total_minutes % 60
    hours = total_minutes // 60
    return f"{hours:02d}:{minutes:02d}:{seconds:02d}.{milliseconds:03d}"

def parse_capcut_json(json_data: dict, offset_ms: int = 0) -> List[Dict[str, Any]]:
    """Phân tích dữ liệu JSON của CapCut / JianYing và trả về danh sách phụ đề có mốc thời gian."""
    materials = json_data.get("materials", {})
    texts_list = materials.get("texts", []) or []
    subtitles_list = materials.get("subtitles", []) or []
    
    # Tạo từ điển map ID -> nội dung text
    text_map = {}
    for item in texts_list + subtitles_list:
        item_id = item.get("id")
        raw_content = item.get("content") or item.get("text") or ""
        text = clean_text_content(raw_content)
        if item_id:
            text_map[item_id] = text

    tracks = json_data.get("tracks", []) or []
    entries = []

    for track_idx, track in enumerate(tracks):
        segments = track.get("segments", []) or []
        for seg in segments:
            mat_id = seg.get("material_id")
            if not mat_id or mat_id not in text_map:
                continue
            
            text = text_map[mat_id]
            if not text:
                continue
            
            # Thời gian trong CapCut thường là microseconds (1s = 1,000,000 us)
            target_timerange = seg.get("target_timerange") or seg.get("source_timerange") or {}
            start_us = target_timerange.get("start", 0)
            duration_us = target_timerange.get("duration", 0)
            
            # Quy đổi từ microsecond sang millisecond
            start_ms = int(start_us / 1000) + offset_ms
            duration_ms = int(duration_us / 1000)
            end_ms = start_ms + duration_ms
            
            entries.append({
                "start_ms": start_ms,
                "end_ms": end_ms,
                "duration_ms": duration_ms,
                "text": text,
                "track_index": track_idx
            })

    # Nếu không tìm thấy qua tracks (trường hợp JSON dạng đơn giản như Whisper hoặc danh sách)
    if not entries:
        # Kiểm tra nếu là Whisper format {"segments": [{"start": 0.5, "end": 2.0, "text": "..."}]}
        if "segments" in json_data and isinstance(json_data["segments"], list):
            for seg in json_data["segments"]:
                text = seg.get("text", "").strip()
                start_sec = seg.get("start", 0)
                end_sec = seg.get("end", 0)
                if text:
                    entries.append({
                        "start_ms": int(start_sec * 1000) + offset_ms,
                        "end_ms": int(end_sec * 1000) + offset_ms,
                        "duration_ms": int((end_sec - start_sec) * 1000),
                        "text": text,
                        "track_index": 0
                    })
        # Kiểm tra nếu là list các đối tượng [ {"start": ..., "end": ..., "text": ...} ]
        elif isinstance(json_data, list):
            for item in json_data:
                text = item.get("text") or item.get("content") or ""
                start = item.get("start", 0)
                end = item.get("end", 0)
                # Tự phát hiện đơn vị (giây, ms hay us)
                if end < 1000:
                    start_ms = int(start * 1000)
                    end_ms = int(end * 1000)
                elif end > 10000000:
                    start_ms = int(start / 1000)
                    end_ms = int(end / 1000)
                else:
                    start_ms = int(start)
                    end_ms = int(end)
                if text:
                    entries.append({
                        "start_ms": start_ms + offset_ms,
                        "end_ms": end_ms + offset_ms,
                        "duration_ms": end_ms - start_ms,
                        "text": clean_text_content(text),
                        "track_index": 0
                    })

    # Sắp xếp theo mốc thời gian bắt đầu
    entries.sort(key=lambda x: x["start_ms"])
    return entries

def convert_to_srt(entries: List[Dict[str, Any]]) -> str:
    """Tạo nội dung file định dạng SRT từ danh sách phụ đề."""
    lines = []
    for idx, entry in enumerate(entries, 1):
        start_str = format_timestamp_srt(entry["start_ms"])
        end_str = format_timestamp_srt(entry["end_ms"])
        lines.append(str(idx))
        lines.append(f"{start_str} --> {end_str}")
        lines.append(entry["text"])
        lines.append("")  # Dòng trống phân cách giữa các block
    return "\n".join(lines)

def convert_to_vtt(entries: List[Dict[str, Any]]) -> str:
    """Tạo nội dung file định dạng WebVTT."""
    lines = ["WEBVTT", ""]
    for idx, entry in enumerate(entries, 1):
        start_str = format_timestamp_vtt(entry["start_ms"])
        end_str = format_timestamp_vtt(entry["end_ms"])
        lines.append(str(idx))
        lines.append(f"{start_str} --> {end_str}")
        lines.append(entry["text"])
        lines.append("")
    return "\n".join(lines)

def convert_to_txt(entries: List[Dict[str, Any]]) -> str:
    """Tạo văn bản thuần (chỉ lời thoại)."""
    return "\n".join(e["text"] for e in entries)

def process_file(file_path: str, output_dir: Optional[str] = None, fmt: str = "srt", offset_ms: int = 0) -> bool:
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            
        entries = parse_capcut_json(data, offset_ms=offset_ms)
        if not entries:
            print(f"⚠️  Không tìm thấy phụ đề nào trong file: {file_path}")
            return False
            
        base_name = os.path.splitext(os.path.basename(file_path))[0]
        out_dir = output_dir or os.path.dirname(file_path) or "."
        out_path = os.path.join(out_dir, f"{base_name}.{fmt}")
        
        if fmt == "srt":
            content = convert_to_srt(entries)
        elif fmt == "vtt":
            content = convert_to_vtt(entries)
        elif fmt == "txt":
            content = convert_to_txt(entries)
        else:
            raise ValueError(f"Định dạng không hỗ trợ: {fmt}")
            
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(content)
            
        print(f"✅ Đã trích xuất {len(entries)} câu phụ đề thành công:")
        print(f"   ➔ File xuất: {out_path}")
        return True
    except Exception as e:
        print(f"❌ Lỗi khi xử lý file {file_path}: {e}")
        return False

def main():
    parser = argparse.ArgumentParser(description="Chuyển đổi phụ đề CapCut draft_content.json sang SRT / VTT / TXT")
    parser.add_argument("input", nargs="?", default="sample_draft_content.json", help="Đường dẫn tới file draft_content.json hoặc thư mục chứa dự án")
    parser.add_argument("-o", "--output-dir", help="Thư mục lưu file đầu ra")
    parser.add_argument("-f", "--format", choices=["srt", "vtt", "txt", "all"], default="srt", help="Định dạng xuất (srt, vtt, txt, all)")
    parser.add_argument("--offset", type=int, default=0, help="Điều chỉnh độ trễ thời gian (milliseconds, có thể là số âm)")
    
    args = parser.parse_args()
    
    input_path = args.input
    if not os.path.exists(input_path):
        print(f"❌ Không tìm thấy đường dẫn: {input_path}")
        sys.exit(1)
        
    formats = ["srt", "vtt", "txt"] if args.format == "all" else [args.format]
    
    if os.path.isfile(input_path):
        for fmt in formats:
            process_file(input_path, args.output_dir, fmt, args.offset)
    elif os.path.isdir(input_path):
        found = False
        for root, _, files in os.walk(input_path):
            for file in files:
                if file.lower() in ("draft_content.json", "draft_info.json") or file.endswith(".json"):
                    full_path = os.path.join(root, file)
                    for fmt in formats:
                        if process_file(full_path, args.output_dir, fmt, args.offset):
                            found = True
        if not found:
            print("❌ Không tìm thấy file JSON phụ đề nào trong thư mục được chỉ định.")

if __name__ == "__main__":
    main()
