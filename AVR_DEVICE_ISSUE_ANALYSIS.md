# AVR GCC 14.2.0 Device Support Issue

## Problem Description

When using newer AVR series microcontrollers (AVR128DA64, AVR32DB28) with AVR GCC 14.2.0, including `avr/io.h` fails with:

```
/opt/compiler-explorer/avr/gcc-14.2.0/avr/avr/include/avr/io.h:581:6: warning: #warning "device type not defined" [-Wcpp]
  581 | #    warning "device type not defined"
      |      ^~~~~~~
```

## Root Cause

The AVR GCC 14.2.0 installation at `/opt/compiler-explorer/avr/gcc-14.2.0/` was built with an older version of avr-libc that does not include device definitions for newer AVR microcontrollers released after that avr-libc version.

## Proper Solution

This is an **infrastructure issue** that requires updating the AVR GCC 14.2.0 installation to use a newer version of avr-libc that supports these devices. The fix should be applied at the deployment level, not in the Compiler Explorer codebase.

### Recommended Actions:

1. **Update avr-libc**: Rebuild the AVR GCC 14.2.0 installation with avr-libc version 2.2.0 or newer
2. **Alternative**: Install the device pack files in the existing avr-libc installation
3. **Verification**: Test that `-mmcu=avr128da64` and `-mmcu=avr32db28` work without warnings

### Why This Isn't a Code Fix

- Device headers belong in avr-libc, not in Compiler Explorer
- The AVR toolchain should provide all device support
- Adding device headers to CE would be a workaround, not a proper fix
- Other Compiler Explorer AVR versions likely have the same issue if built with old avr-libc

## Testing

After the infrastructure fix, this code should compile without warnings:

```c
#include <avr/io.h>

void main() {
    PORTA.OUT = 0x02;
}
```

With compiler flags: `-mmcu=avr128da64` or `-mmcu=avr32db28`

## Issue Tracking

This should be reported as an infrastructure issue to update the AVR GCC 14.2.0 installation rather than a code bug.
