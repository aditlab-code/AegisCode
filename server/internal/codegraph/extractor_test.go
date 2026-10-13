package codegraph

import (
	"testing"
)

func TestGoExtractor(t *testing.T) {
	src := `package test

import "fmt"

// Greeter provides greeting operations.
type Greeter struct {
	Prefix string
}

// Greet greets the target with formatted message.
func (g *Greeter) Greet(name string) string {
	fmt.Println(name)
	return g.Prefix + " " + name
}

// RunApp is the entry point.
func RunApp() {
	g := &Greeter{Prefix: "Hello"}
	_ = g.Greet("World")
}
`
	ext := NewGoExtractor()
	res, err := ext.Extract("test.go", []byte(src))
	if err != nil {
		t.Fatalf("Extract failed: %v", err)
	}

	if res.Language != "go" {
		t.Errorf("expected language go, got %s", res.Language)
	}

	// Verify symbols
	foundGreeter := false
	foundGreetMethod := false
	foundRunApp := false

	for _, s := range res.Symbols {
		if s.Name == "Greeter" && s.Kind == KindClass {
			foundGreeter = true
		}
		if s.Name == "Greet" && s.Kind == KindMethod && s.Scope == "*Greeter" {
			foundGreetMethod = true
			if s.DocComment != "Greet greets the target with formatted message." {
				t.Errorf("unexpected doc comment: %q", s.DocComment)
			}
		}
		if s.Name == "RunApp" && s.Kind == KindFunction {
			foundRunApp = true
		}
	}

	if !foundGreeter {
		t.Errorf("expected Greeter struct not found")
	}
	if !foundGreetMethod {
		t.Errorf("expected Greet method not found")
	}
	if !foundRunApp {
		t.Errorf("expected RunApp function not found")
	}

	// Verify edges from RunApp
	foundInstantiatesGreeter := false
	foundCallsGreet := false
	for _, e := range res.Edges {
		if e.TargetRawName == "Greeter" && e.Relation == RelInstantiates {
			foundInstantiatesGreeter = true
		}
		if e.TargetRawName == "Greet" && e.Relation == RelCalls {
			foundCallsGreet = true
		}
	}

	if !foundInstantiatesGreeter {
		t.Errorf("expected RelInstantiates edge for Greeter not found: %+v", res.Edges)
	}
	if !foundCallsGreet {
		t.Errorf("expected RelCalls edge for Greet not found: %+v", res.Edges)
	}
}

func TestTSExtractor(t *testing.T) {
	src := `// Service handles authentication
export interface AuthService {
	validate(token: string): boolean;
}

export class DefaultAuthService implements AuthService {
	validate(token: string): boolean {
		return checkToken(token);
	}
}

/**
 * Handle incoming login request.
 */
export async function handleLogin(req: Request) {
	const valid = validateToken(req.token);
	logInfo("Login attempted");
	return valid;
}

export const processAuth = async (token: string) => {
	handleLogin(token);
};
`
	ext := NewTSExtractor()
	res, err := ext.Extract("auth.ts", []byte(src))
	if err != nil {
		t.Fatalf("Extract failed: %v", err)
	}

	if res.Language != "typescript" {
		t.Errorf("expected language typescript, got %s", res.Language)
	}

	foundInterface := false
	foundClass := false
	foundFunc := false
	foundArrow := false

	for _, s := range res.Symbols {
		if s.Name == "AuthService" && s.Kind == KindInterface {
			foundInterface = true
		}
		if s.Name == "DefaultAuthService" && s.Kind == KindClass {
			foundClass = true
		}
		if s.Name == "handleLogin" && s.Kind == KindFunction {
			foundFunc = true
			if s.LineStart == 0 {
				t.Errorf("expected non-zero line start")
			}
		}
		if s.Name == "processAuth" && s.Kind == KindFunction {
			foundArrow = true
		}
	}

	if !foundInterface {
		t.Errorf("expected AuthService interface not found")
	}
	if !foundClass {
		t.Errorf("expected DefaultAuthService class not found")
	}
	if !foundFunc {
		t.Errorf("expected handleLogin function not found")
	}
	if !foundArrow {
		t.Errorf("expected processAuth arrow function not found")
	}

	// Verify call edges
	foundCallValidate := false
	foundCallHandleLogin := false
	for _, e := range res.Edges {
		if e.TargetRawName == "validateToken" {
			foundCallValidate = true
		}
		if e.TargetRawName == "handleLogin" {
			foundCallHandleLogin = true
		}
	}

	if !foundCallValidate {
		t.Errorf("expected call to validateToken not found: %+v", res.Edges)
	}
	if !foundCallHandleLogin {
		t.Errorf("expected call to handleLogin not found: %+v", res.Edges)
	}
}
