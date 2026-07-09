#!/usr/bin/env python3
"""
Backend API Test for Cadence AI Parse Endpoint
Tests POST /api/ai/parse endpoint that uses Gemini 2.5 Flash via Python subprocess
"""

import requests
import json
import time

# Base URL for testing
BASE_URL = "http://localhost:3000/api"

def test_ai_parse_full_example():
    """
    Test Case 1: Full example with multiple patients and various constraints
    Expected: 3 commands with specific patient data
    """
    print("\n" + "="*80)
    print("TEST CASE 1: Full example with Paola, Marco, and Anna")
    print("="*80)
    
    url = f"{BASE_URL}/ai/parse"
    headers = {"Content-Type": "application/json"}
    payload = {
        "text": "Paola can come Wednesday or Friday. Marco cannot come Thursday afternoon. Anna needs a 45 minute appointment and is high priority."
    }
    
    try:
        print(f"POST {url}")
        print(f"Payload: {json.dumps(payload, indent=2)}")
        
        start_time = time.time()
        response = requests.post(url, json=payload, headers=headers, timeout=55)
        elapsed = time.time() - start_time
        
        print(f"\nResponse Time: {elapsed:.2f}s")
        print(f"Status Code: {response.status_code}")
        print(f"Response Text: {response.text[:500]}")
        
        # Validate response
        if response.status_code != 200:
            print(f"❌ FAILED: Expected status 200, got {response.status_code}")
            return False
        
        data = response.json()
        
        # Check for commands array
        if "commands" not in data:
            print("❌ FAILED: Response missing 'commands' key")
            return False
        
        commands = data["commands"]
        if not isinstance(commands, list):
            print("❌ FAILED: 'commands' is not an array")
            return False
        
        if len(commands) != 3:
            print(f"❌ FAILED: Expected 3 commands, got {len(commands)}")
            return False
        
        print(f"\n✓ Found {len(commands)} commands")
        
        # Validate Paola
        paola = next((c for c in commands if "paola" in c.get("patient_name", "").lower()), None)
        if not paola:
            print("❌ FAILED: No command found for Paola")
            return False
        
        print(f"\n✓ Found Paola command: {json.dumps(paola, indent=2)}")
        
        available = paola.get("available", [])
        weekdays = [a.get("weekday", "").lower() for a in available]
        if "wednesday" not in weekdays or "friday" not in weekdays:
            print(f"❌ FAILED: Paola should have wednesday and friday available, got {weekdays}")
            return False
        
        print(f"✓ Paola has correct availability: {weekdays}")
        
        # Validate Marco
        marco = next((c for c in commands if "marco" in c.get("patient_name", "").lower()), None)
        if not marco:
            print("❌ FAILED: No command found for Marco")
            return False
        
        print(f"\n✓ Found Marco command: {json.dumps(marco, indent=2)}")
        
        unavailable = marco.get("unavailable", [])
        thursday_afternoon = next((u for u in unavailable if u.get("weekday") == "thursday" and u.get("period") == "afternoon"), None)
        if not thursday_afternoon:
            print(f"❌ FAILED: Marco should have thursday afternoon unavailable, got {unavailable}")
            return False
        
        print(f"✓ Marco has correct unavailability: thursday afternoon")
        
        # Validate Anna
        anna = next((c for c in commands if "anna" in c.get("patient_name", "").lower()), None)
        if not anna:
            print("❌ FAILED: No command found for Anna")
            return False
        
        print(f"\n✓ Found Anna command: {json.dumps(anna, indent=2)}")
        
        if anna.get("duration_minutes") != 45:
            print(f"❌ FAILED: Anna should have duration_minutes=45, got {anna.get('duration_minutes')}")
            return False
        
        if anna.get("priority") != "high":
            print(f"❌ FAILED: Anna should have priority='high', got {anna.get('priority')}")
            return False
        
        print(f"✓ Anna has correct duration (45 min) and priority (high)")
        
        print("\n✅ TEST CASE 1 PASSED")
        return True
        
    except requests.exceptions.Timeout:
        print(f"❌ FAILED: Request timed out after 55 seconds")
        return False
    except Exception as e:
        print(f"❌ FAILED: Exception occurred: {str(e)}")
        import traceback
        traceback.print_exc()
        return False


def test_ai_parse_empty_text():
    """
    Test Case 2: Empty text input
    Expected: HTTP 200 with {"commands": []}
    """
    print("\n" + "="*80)
    print("TEST CASE 2: Empty text input")
    print("="*80)
    
    url = f"{BASE_URL}/ai/parse"
    headers = {"Content-Type": "application/json"}
    payload = {"text": ""}
    
    try:
        print(f"POST {url}")
        print(f"Payload: {json.dumps(payload, indent=2)}")
        
        start_time = time.time()
        response = requests.post(url, json=payload, headers=headers, timeout=55)
        elapsed = time.time() - start_time
        
        print(f"\nResponse Time: {elapsed:.2f}s")
        print(f"Status Code: {response.status_code}")
        print(f"Response Body: {json.dumps(response.json(), indent=2)}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected status 200, got {response.status_code}")
            return False
        
        data = response.json()
        
        if "commands" not in data:
            print("❌ FAILED: Response missing 'commands' key")
            return False
        
        if data["commands"] != []:
            print(f"❌ FAILED: Expected empty commands array, got {data['commands']}")
            return False
        
        print("\n✅ TEST CASE 2 PASSED")
        return True
        
    except Exception as e:
        print(f"❌ FAILED: Exception occurred: {str(e)}")
        import traceback
        traceback.print_exc()
        return False


def test_ai_parse_missing_text_field():
    """
    Test Case 3: Missing text field in request body
    Expected: Handled gracefully (HTTP 200 with commands:[] is acceptable, must NOT 500)
    """
    print("\n" + "="*80)
    print("TEST CASE 3: Missing text field")
    print("="*80)
    
    url = f"{BASE_URL}/ai/parse"
    headers = {"Content-Type": "application/json"}
    payload = {}
    
    try:
        print(f"POST {url}")
        print(f"Payload: {json.dumps(payload, indent=2)}")
        
        start_time = time.time()
        response = requests.post(url, json=payload, headers=headers, timeout=55)
        elapsed = time.time() - start_time
        
        print(f"\nResponse Time: {elapsed:.2f}s")
        print(f"Status Code: {response.status_code}")
        print(f"Response Body: {json.dumps(response.json(), indent=2)}")
        
        if response.status_code == 500:
            print(f"❌ FAILED: Got unhandled 500 error - should handle gracefully")
            return False
        
        if response.status_code != 200:
            print(f"⚠️  WARNING: Expected status 200, got {response.status_code} (but not 500, so acceptable)")
        
        data = response.json()
        
        if "commands" in data and data["commands"] == []:
            print("✓ Response contains empty commands array (acceptable)")
        elif "error" in data:
            print(f"✓ Response contains error message (acceptable): {data.get('error')}")
        else:
            print(f"✓ Response handled gracefully: {data}")
        
        print("\n✅ TEST CASE 3 PASSED (handled gracefully, no 500 crash)")
        return True
        
    except Exception as e:
        print(f"❌ FAILED: Exception occurred: {str(e)}")
        import traceback
        traceback.print_exc()
        return False


def main():
    print("\n" + "="*80)
    print("CADENCE AI PARSE ENDPOINT BACKEND TESTS")
    print("="*80)
    print(f"Testing endpoint: {BASE_URL}/ai/parse")
    print("Note: Each test may take 3-10 seconds (AI processing time)")
    
    results = []
    
    # Run all test cases
    results.append(("Test 1: Full example (Paola, Marco, Anna)", test_ai_parse_full_example()))
    results.append(("Test 2: Empty text", test_ai_parse_empty_text()))
    results.append(("Test 3: Missing text field", test_ai_parse_missing_text_field()))
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    for test_name, passed in results:
        status = "✅ PASSED" if passed else "❌ FAILED"
        print(f"{status}: {test_name}")
    
    total = len(results)
    passed = sum(1 for _, p in results if p)
    
    print(f"\nTotal: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED!")
        return 0
    else:
        print(f"\n⚠️  {total - passed} test(s) failed")
        return 1


if __name__ == "__main__":
    exit(main())
