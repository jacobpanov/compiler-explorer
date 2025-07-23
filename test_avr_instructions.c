// Test file to see what AVR instructions are available in GCC 14.2.0
// This will help us identify if newer instructions are supported

#include <avr/io.h>
#include <avr/interrupt.h>

int main() {
    // Test various operations that might use different instructions
    volatile uint8_t a = 10;
    volatile uint8_t b = 20;
    volatile uint8_t result;
    
    // Basic arithmetic
    result = a + b;       // ADD
    result = a - b;       // SUB 
    result = a * b;       // MUL (might use software routine)
    result = a / b;       // Software division
    
    // Bit operations
    result = a & b;       // AND
    result = a | b;       // OR
    result = a ^ b;       // EOR (exclusive or)
    result = ~a;          // COM (complement)
    
    // Shifts
    result = a << 1;      // LSL (logical shift left)
    result = a >> 1;      // LSR (logical shift right)
    
    // Comparisons
    if (a < b) {          // CP (compare) followed by BRLT
        result = 1;
    }
    
    // More advanced operations
    volatile uint16_t wide = 0x1234;
    wide += 5;            // ADIW (add immediate to word)
    
    // Test interrupts
    cli();                // CLI (clear interrupt)
    sei();                // SEI (set interrupt)
    
    // Memory operations
    volatile uint8_t *ptr = &a;
    *ptr = 42;            // ST (store indirect)
    result = *ptr;        // LD (load indirect)
    
    // Test some specific AVR instructions by using inline assembly
    __asm__ volatile ("nop");          // NOP
    __asm__ volatile ("wdr");          // WDR (watchdog reset)
    
    // Test fractional multiply (newer AVR feature)
    // This might not be available on all AVR devices
    uint8_t fmul_a = 0x80;
    uint8_t fmul_b = 0x40;
    uint16_t fmul_result;
    __asm__ volatile (
        "fmuls %1, %2\n\t"
        "movw %0, r0\n\t"
        "clr r1"
        : "=r" (fmul_result)
        : "r" (fmul_a), "r" (fmul_b)
        : "r0", "r1"
    );
    
    return 0;
}
