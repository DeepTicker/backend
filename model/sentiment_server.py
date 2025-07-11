#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
금융 감정분석 Flask 서버
모델을 한 번만 로딩하고 상주시켜 빠른 분석 제공
"""

from flask import Flask, request, jsonify
from transformers import pipeline, AutoTokenizer, AutoModelForSequenceClassification
import torch
import logging
import sys
import os
import json
from datetime import datetime

# 로깅 설정
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__)

# 전역 변수로 모델 저장
sentiment_analyzer = None
tokenizer = None
model = None

def load_model():
    """감정분석 모델 로딩"""
    global sentiment_analyzer, tokenizer, model
    
    try:
        logger.info("🔄 감정분석 모델 로딩 시작...")
        
        # 1차 모델: 한국 금융특화 모델
        model_name = "krevas/finance-koelectra-small-discriminator"
        
        try:
            tokenizer = AutoTokenizer.from_pretrained(model_name)
            model = AutoModelForSequenceClassification.from_pretrained(model_name)
            sentiment_analyzer = pipeline(
                "text-classification",
                model=model,
                tokenizer=tokenizer,
                device=0 if torch.cuda.is_available() else -1  # GPU 사용 가능하면 사용
            )
            logger.info(f"✅ 1차 모델 로딩 성공: {model_name}")
            
        except Exception as e:
            logger.warning(f"⚠️ 1차 모델 실패: {e}")
            # 2차 모델: 대체 모델
            model_name = "Copycats/koelectra-base-v3-generalized-sentiment-analysis"
            tokenizer = AutoTokenizer.from_pretrained(model_name)
            model = AutoModelForSequenceClassification.from_pretrained(model_name)
            sentiment_analyzer = pipeline(
                "text-classification",
                model=model,
                tokenizer=tokenizer,
                device=0 if torch.cuda.is_available() else -1
            )
            logger.info(f"✅ 2차 모델 로딩 성공: {model_name}")
            
        logger.info("🚀 모델 로딩 완료! 서버 준비됨")
        
    except Exception as e:
        logger.error(f"❌ 모델 로딩 실패: {e}")
        raise e

def analyze_sentiment_for_entity(entity_name, entity_type, content):
    """개별 엔티티에 대한 감정분석"""
    try:
        # 엔티티와 관련된 문맥 추출
        sentences = content.split('.')
        relevant_sentences = []
        
        for sentence in sentences:
            if entity_name in sentence:
                relevant_sentences.append(sentence.strip())
        
        # 관련 문맥이 없으면 전체 내용 사용
        if not relevant_sentences:
            context = content[:200]  # 처음 200자만 사용
        else:
            context = '. '.join(relevant_sentences[:2])  # 최대 2문장
        
        # 분석 텍스트 구성
        analysis_text = f"{entity_name}: {context}"
        
        # 감정분석 실행
        result = sentiment_analyzer(analysis_text[:512])  # 토큰 제한
        
        # 결과 해석
        sentiment_label = result[0]['label'].upper()
        confidence_score = float(result[0]['score']) * 100
        
        # 라벨 표준화
        if sentiment_label in ['POSITIVE', 'POS', '1']:
            sentiment = "+"
        elif sentiment_label in ['NEGATIVE', 'NEG', '0']:
            sentiment = "-"
        else:
            sentiment = "0"  # 중립
        
        return {
            "entity_name": entity_name,
            "entity_type": entity_type,
            "sentiment": sentiment,
            "confidence_score": round(confidence_score, 1)
            # reasoning 제거 - 개별주/테마/산업에는 불필요
        }
        
    except Exception as e:
        logger.error(f"엔티티 '{entity_name}' 분석 실패: {e}")
        return {
            "entity_name": entity_name,
            "entity_type": entity_type,
            "sentiment": "0",
            "confidence_score": 0
            # reasoning 제거 - 개별주/테마/산업에는 불필요
        }

@app.route('/health', methods=['GET'])
def health_check():
    """서버 상태 확인"""
    return jsonify({
        "status": "healthy",
        "model_loaded": sentiment_analyzer is not None,
        "timestamp": datetime.now().isoformat()
    })

@app.route('/analyze', methods=['POST'])
def analyze_sentiment():
    """배치 감정분석 API"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({"success": False, "error": "JSON 데이터가 필요합니다"}), 400
        
        entities = data.get('entities', [])
        content = data.get('content', '')
        
        if not entities or not content:
            return jsonify({"success": False, "error": "entities와 content가 필요합니다"}), 400
        
        logger.info(f"📊 배치 분석 시작: {len(entities)}개 엔티티")
        
        results = []
        
        # 🔥 배치 처리: 모든 엔티티를 한번에 처리
        for entity in entities:
            entity_name = entity.get('name', '')
            entity_type = entity.get('type', 'unknown')
            
            if not entity_name:
                continue
                
            result = analyze_sentiment_for_entity(entity_name, entity_type, content)
            results.append(result)
        
        logger.info(f"✅ 배치 분석 완료: {len(results)}개 결과")
        
        return jsonify({
            "success": True,
            "results": results,
            "total_processed": len(results),
            "timestamp": datetime.now().isoformat()
        })
        
    except Exception as e:
        logger.error(f"❌ 분석 API 오류: {e}")
        return jsonify({
            "success": False,
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }), 500

@app.route('/analyze/single', methods=['POST'])
def analyze_single():
    """단일 엔티티 감정분석 API"""
    try:
        data = request.get_json()
        
        entity_name = data.get('entity_name', '')
        entity_type = data.get('entity_type', 'unknown')
        content = data.get('content', '')
        
        if not entity_name or not content:
            return jsonify({"success": False, "error": "entity_name과 content가 필요합니다"}), 400
        
        result = analyze_sentiment_for_entity(entity_name, entity_type, content)
        
        return jsonify({
            "success": True,
            "result": result,
            "timestamp": datetime.now().isoformat()
        })
        
    except Exception as e:
        logger.error(f"❌ 단일 분석 API 오류: {e}")
        return jsonify({
            "success": False,
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }), 500

if __name__ == '__main__':
    try:
        # 모델 로딩
        load_model()
        
        # 서버 시작
        logger.info("🌟 Flask 감정분석 서버 시작")
        logger.info("📍 URL: http://127.0.0.1:5555")
        logger.info("📍 Health Check: http://127.0.0.1:5555/health")
        logger.info("📍 API: POST http://127.0.0.1:5555/analyze")
        
        app.run(
            host='127.0.0.1',
            port=5555,
            debug=False,  # 운영 환경에서는 False
            threaded=True  # 다중 요청 처리
        )
        
    except Exception as e:
        logger.error(f"💥 서버 시작 실패: {e}")
        sys.exit(1) 